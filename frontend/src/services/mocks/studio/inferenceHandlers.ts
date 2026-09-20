import { http, HttpResponse } from 'msw';
import { STUDIO_AUTHORING_V2 } from '@/utils/constants/appConfig';
import { MOCK_READABLE_CSIS, mockTests } from './fixtures';
import type { InferenceView, InferenceWrite } from '@/types/studio/inferenceTypes';
import type { TestDto } from '@/types/studio/studioTypes';

const views = new Map<string, InferenceView>();
const baselines = new Map<string, InferenceView>();
const BASE = '*/api/v2/studio';
const hash = (revision: number) => revision.toString(16).padStart(64, '0');
const problem = (code: string, status = 409) => HttpResponse.json({ code, message: code }, { status });
// Demonstration state: snippets are fixtures, never model output or semantic evidence.
export const inferenceMockTests = (): TestDto[] => {
  if (STUDIO_AUTHORING_V2 && !views.has(DEMO_ID)) seedDemo();
  return [...views.values()].map(view => view.test);
};
export const seedInferenceMock = (view: InferenceView) => {
  views.set(view.test.id, structuredClone(view));
  if (view.test.compileStatus === 'READY' && view.test.lastRunStatus === 'PASSED' && view.test.confirmedRevisionId) baselines.set(view.test.id, structuredClone(view));
};
export const resetInferenceMocks = () => { views.clear(); baselines.clear(); };
function fromTest(test: TestDto): InferenceView {
  return { test:structuredClone(test),authoring:null,authoringHash:null,scopeReviewedBy:null,scopeReviewedAt:null,compileAttempt:null };
}
function get(id: string): InferenceView | undefined {
  const existing=views.get(id); if (existing) return existing.test.csiId && MOCK_READABLE_CSIS.includes(existing.test.csiId) ? existing : undefined;
  const test=mockTests.find(t=>t.id===id && t.csiId !== null && MOCK_READABLE_CSIS.includes(t.csiId)); if (!test) return undefined;
  const view=fromTest(test); views.set(id,view); return view;
}
function validWrite(body: InferenceWrite): boolean {
  if (!body || typeof body !== 'object') return false;
  const allowed = new Set(['name','description','csiId','environment','steps','scope','variables','configuration','sourceRevision','configurationRevision']);
  if (Object.keys(body).some(key => !allowed.has(key))) return false;
  if (!body.scope || Object.keys(body.scope).some(key => !['policyVersion','declaration'].includes(key))) return false;
  return typeof body.name === 'string' && !!body.name.trim() && typeof body.environment === 'string' && !!body.environment.trim()
    && typeof body.csiId === 'string' && MOCK_READABLE_CSIS.includes(body.csiId)
    && Array.isArray(body.steps) && body.steps.length > 0 && body.steps.length <= 100
    && body.steps.every(step => step && typeof step === 'object' && Object.keys(step).every(key => ['id','text'].includes(key)) && (step.id == null || typeof step.id === 'string') && typeof step.text === 'string' && !!step.text.trim() && step.text.length <= 500)
    && body.scope?.policyVersion === '1.0.0' && ['UNKNOWN', 'STEP_SCOPED'].includes(body.scope.declaration);
}
const DEMO_ID = 'dc000000-0000-4000-8000-000000000025';
function seedDemo(): void {
  const template=mockTests.find(test=>test.csiId && MOCK_READABLE_CSIS.includes(test.csiId));
  if (!template) return;
  const steps=['Open the account form','Enter the account name','Check the saved account'];
  const ids=steps.map((_,index)=>`dc000000-0000-4000-8000-00000000000${index}`);
  const revision='dc000000-0000-4000-8000-000000000099';
  const artifact={version:1,steps:steps.map((text,index)=>({stepIndex:index,originalText:text,code:`await expect(page.getByText(${JSON.stringify(text)})).toBeVisible();`}))};
  const demo=fromTest({...template,id:DEMO_ID,name:'Demo: previously passing scoped test',steps,compileStatus:'READY',
    sourceRevision:1,configurationRevision:1,confirmedRevisionId:revision,currentCandidateRevisionId:revision,
    currentCandidateArtifact:artifact,currentCandidateArtifactHash:hash(1),lastRunStatus:'PASSED',lastRunAt:'2026-09-16T12:00:00Z',
    confirmedRevisionArtifact:artifact,confirmedRevisionArtifactHash:hash(1),
    description:'Mock demonstration only. No model or browser produced this result.'});
  demo.authoring={version:2,steps:steps.map((text,index)=>({id:ids[index],text})),scope:{policyVersion:'1.0.0',declaration:'STEP_SCOPED'}};
  demo.authoringHash=hash(1);demo.scopeReviewedBy='mock-author';demo.scopeReviewedAt='2026-09-16T12:00:00Z';
  demo.compileAttempt={compileRequestId:'dc000000-0000-4000-8000-000000000098',sourceRevision:1,configurationRevision:1,authoringHash:hash(1),
    state:'CANDIDATE',stage:'COMPLETE',revisionId:revision,artifactHash:hash(1),errorCode:null,diagnostics:null,
    plan:{requestedMode:'FULL',selectedMode:'FULL',reason:'EXPLICIT_FULL',compilationFingerprint:hash(2),baselineRevisionId:null,
      baselineExecutionId:null,baselineExecutionStartedAt:null,writableStepIds:ids,reusedStepIds:[],impactPolicyVersion:'1.0.0'},
    usage:{proposalCount:0,repairCount:0,transportAttemptCount:0,inputTokens:null,outputTokens:null,thinkingTokens:null,usageAvailable:false,finishReason:null,cancellationOutcome:null,elapsedMs:0}};
  seedInferenceMock(demo);
}
export const studioInferenceHandlers = [
  http.get(`${BASE}/tests/:id`,({params})=>{const view=get(String(params.id));return view?HttpResponse.json(view):problem('NOT_FOUND',404);}),
  http.put(`${BASE}/tests/:id`,async({params,request})=>{
    const id=String(params.id); const view=get(id); if (!view) return problem('NOT_FOUND',404);
    const body=await request.json() as InferenceWrite;
    if (!validWrite(body)) return problem('INVALID_AUTHORING', 400);
    if(body.sourceRevision!==view.test.sourceRevision || body.configurationRevision!==view.test.configurationRevision) return problem('STALE_REVISION');
    if(body.csiId!==view.test.csiId) return problem('CSI_IMMUTABLE');
    const ids=body.steps.flatMap(s=>s.id?[s.id]:[]);
    if(new Set(ids).size!==ids.length || ids.some(id=>!view.authoring?.steps.some(s=>s.id===id))) return problem('INVALID_STEP_ID',400);
    const authoring={version:2 as const,steps:body.steps.map(s=>({...s,id:s.id??crypto.randomUUID()})),scope:body.scope};
    const changed=JSON.stringify(authoring)!==JSON.stringify(view.authoring);
    const configChanged=JSON.stringify(body.configuration)!==JSON.stringify(view.test.configuration)||body.environment!==view.test.environment||JSON.stringify(body.variables)!==JSON.stringify(view.test.variables);
    view.test={...view.test,...body,steps:body.steps.map(s=>s.text),sourceRevision:view.test.sourceRevision+(changed?1:0),configurationRevision:view.test.configurationRevision+(configChanged?1:0)};
    view.authoring=authoring; view.authoringHash=hash(view.test.sourceRevision);
    if(changed){view.scopeReviewedBy='mock-author';view.scopeReviewedAt=new Date().toISOString();}
    if(changed||configChanged){view.test.compileStatus='STALE';view.test.currentCandidateRevisionId=null;view.test.currentCandidateArtifact=null;view.test.currentCandidateArtifactHash=null;view.test.compileError=null;view.test.compileDiagnostics=null;view.compileAttempt=null;}
    return HttpResponse.json(view);
  }),
  http.post(`${BASE}/tests`,async({request})=>{
    const body=await request.json() as InferenceWrite;
    if (!validWrite(body)) return problem('INVALID_AUTHORING', 400);
    if (body.steps.some(step => step.id != null)) return problem('INVALID_STEP_ID', 400);
    const template=mockTests[0]; if(!template) return problem('NO_FIXTURE',500);
    const id=crypto.randomUUID(); const view=fromTest({...template,...body,id,steps:body.steps.map(s=>s.text),sourceRevision:1,configurationRevision:1,
      compileStatus:'STALE',confirmedRevisionId:null,confirmedRevisionArtifact:null,confirmedRevisionArtifactHash:null,currentCandidateRevisionId:null,currentCandidateArtifact:null,currentCandidateArtifactHash:null,lastRunStatus:null,lastRunAt:null});
    view.authoring={version:2,steps:body.steps.map(s=>({...s,id:crypto.randomUUID()})),scope:body.scope};view.authoringHash=hash(1);
    views.set(id,view);return HttpResponse.json(view,{status:201});
  }),
  http.post(`${BASE}/tests/:id/compile`,async({params,request})=>{
    const id=String(params.id);const view=get(id);if(!view?.authoring) return problem('STALE_REVISION');
    const body=await request.json() as {mode:'AUTO'|'FULL';sourceRevision:number;configurationRevision:number;authoringHash:string};
    if (!['AUTO','FULL'].includes(body.mode)) return problem('INVALID_MODE',400);
    if (Object.keys(body).some(key=>!['mode','sourceRevision','configurationRevision','authoringHash'].includes(key)) || !['AUTO','FULL'].includes(body.mode)) return problem('INVALID_COMPILE',400);
    if(body.sourceRevision!==view.test.sourceRevision||body.configurationRevision!==view.test.configurationRevision||body.authoringHash!==view.authoringHash) return problem('STALE_REVISION');
    const baseline=baselines.get(id);let first=0;
    if(body.mode==='AUTO'&&baseline?.authoring?.scope.declaration==='STEP_SCOPED'&&view.authoring.scope.declaration==='STEP_SCOPED'&&baseline.test.lastRunStatus==='PASSED'
        &&baseline.authoring.steps.length===view.authoring.steps.length&&baseline.authoring.steps.every((step,index)=>step.id===view.authoring?.steps[index]?.id)){
      while(first<view.authoring.steps.length&&JSON.stringify(baseline.authoring.steps[first])===JSON.stringify(view.authoring.steps[first]))first++;
    }
    const mode=first===view.authoring.steps.length?'REUSE':first>0?'INCREMENTAL':'FULL';
    const revision=crypto.randomUUID();const requestId=crypto.randomUUID();
    const artifact={version:1,steps:view.authoring.steps.map((s,i)=>({stepIndex:i,originalText:s.text,
      code:i<first&&baseline?.test.currentCandidateArtifact?.steps[i]?baseline.test.currentCandidateArtifact.steps[i].code:`await expect(page.getByText(${JSON.stringify(s.text)})).toBeVisible();`}))};
    const plan={requestedMode:body.mode,selectedMode:mode as 'FULL'|'INCREMENTAL'|'REUSE',reason:mode==='INCREMENTAL'?'SCOPED_SUFFIX':mode==='REUSE'?'UNCHANGED_SOURCE':body.mode==='FULL'?'EXPLICIT_FULL':view.authoring.scope.declaration==='UNKNOWN'?'SCOPE_UNKNOWN':!baseline?'NO_ELIGIBLE_BASELINE':'ALL_STEPS_AFFECTED',
      compilationFingerprint:hash(2),baselineRevisionId:baseline?.test.confirmedRevisionId??null,baselineExecutionId:baseline ? '00000000-0000-4000-8000-000000000001' : null,baselineExecutionStartedAt:baseline?.test.lastRunAt??null,
      writableStepIds:view.authoring.steps.slice(first).map(s=>s.id as string),reusedStepIds:view.authoring.steps.slice(0,first).map(s=>s.id as string),impactPolicyVersion:'1.0.0' as const};
    view.compileAttempt={compileRequestId:requestId,sourceRevision:view.test.sourceRevision,configurationRevision:view.test.configurationRevision,authoringHash:view.authoringHash,
      state:'CANDIDATE',stage:'COMPLETE',plan,revisionId:revision,artifactHash:hash(view.test.sourceRevision),errorCode:null,diagnostics:null,usage:{proposalCount:mode==='REUSE'?0:1,repairCount:0,transportAttemptCount:0,inputTokens:null,outputTokens:null,thinkingTokens:null,usageAvailable:false,finishReason:null,cancellationOutcome:null,elapsedMs:0}};
    view.test={...view.test,compileStatus:'AWAITING_CONFIRMATION',currentCandidateRevisionId:revision,currentCandidateArtifact:artifact,currentCandidateArtifactHash:view.compileAttempt.artifactHash};
    return HttpResponse.json({compileRequestId:requestId,compileStatus:'COMPILING',sourceRevision:view.test.sourceRevision,configurationRevision:view.test.configurationRevision,authoringHash:view.authoringHash,plan},{status:202});
  }),
  http.post(`${BASE}/tests/:id/confirm-compile`,async({params,request})=>{
    const view=get(String(params.id));if(!view?.compileAttempt)return problem('STALE_CANDIDATE');
    if(view.test.compileStatus !== 'AWAITING_CONFIRMATION') return problem('STALE_CANDIDATE');
    const body=await request.json() as Record<string,unknown>;const attempt=view.compileAttempt;
    const expected={compileRequestId:attempt.compileRequestId,revisionId:attempt.revisionId,artifactHash:attempt.artifactHash,sourceRevision:view.test.sourceRevision,configurationRevision:view.test.configurationRevision,authoringHash:view.authoringHash};
    if(Object.keys(body).length!==6||Object.entries(expected).some(([key,value])=>body[key]!==value))return problem('STALE_CANDIDATE');
    view.test.compileStatus='READY';view.test.confirmedRevisionId=attempt.revisionId;
    view.test.confirmedRevisionArtifact=structuredClone(view.test.currentCandidateArtifact ?? null);
    view.test.confirmedRevisionArtifactHash=view.test.currentCandidateArtifactHash??null;
    return HttpResponse.json(view);
  }),
];
