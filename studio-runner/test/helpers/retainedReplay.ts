import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Artifact3,Execute3,Launch3,ValidationBasis} from '../../src/executor/observedOperations.js';
import {hashObserved} from '../../src/validator/observedReferencePolicy.js';
type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? {-readonly [K in keyof T]: Mutable<T[K]>} : T;
interface Fixtures {launch:Launch3;graphTimingConformance:{graphCases:{name:string;expected:string;expectedArtifact:Artifact3;basis:ValidationBasis}[]}}
const fixtures=JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url),'utf8')) as Fixtures;
/** Genuine complete conformance artifact under a fresh synthetic unit admission; not historical/native proof. */
export function retainedReplay(name='admitted-binding-replacement'):{artifact:Mutable<Artifact3>;execute:Mutable<Execute3>;launch:Mutable<Launch3>;basis:ValidationBasis} {
  const row=fixtures.graphTimingConformance.graphCases.find(item=>item.name===name&&item.expected==='ACCEPT');if(!row)throw new Error('RETAINED_CASE');
  const artifact=structuredClone(row.expectedArtifact) as Mutable<Artifact3>,launch=structuredClone(fixtures.launch) as Mutable<Launch3>;
  launch.runId=randomUUID();launch.attemptId=randomUUID();launch.admission.admissionId=randomUUID();launch.admission.startDeadlineAt=new Date(Date.now()+5000).toISOString();launch.admission.runDeadlineAt=new Date(Date.now()+30000).toISOString();
  launch.admission.request={...launch.admission.request,executionId:launch.runId,attemptId:launch.attemptId,admissionId:launch.admission.admissionId,artifactHash:hashObserved(artifact),learnedPlanHash:artifact.learnedPlanHash,referencePolicyHash:hashObserved(artifact.replayPolicy),publicationEvidenceHash:artifact.replayPolicy.publicationEvidenceHash,configurationHash:artifact.configurationHash};launch.configurationHash=artifact.configurationHash;
  const execute:Mutable<Execute3>={kind:'execute',protocolVersion:3,mode:'observed',runId:launch.runId,attemptId:launch.attemptId,configurationHash:artifact.configurationHash,profileHash:hashObserved(artifact.profile),waitStrategy:row.basis.configuration.waitStrategy,stepTimeoutMs:row.basis.configuration.timeoutSeconds*1000,steps:structuredClone(artifact.steps),guards:structuredClone(artifact.guards),bindings:artifact.replayPolicy.bindings.map(binding=>({bindingId:binding.bindingId,producer:binding.producer,recipe:binding.recipe,origin:binding.sourceOrigin})),transfers:structuredClone(artifact.replayPolicy.transfers),inputs:artifact.inputRecipes.map(input=>{
    if(input.kind==='secretRef'){if(input.provenance.kind!=='configuration')throw new Error('RECIPE');return {inputId:input.inputId,stepId:input.stepId,kind:'secretRef',intendedSlot:'fill.value',referenceName:input.provenance.referenceName};}
    const source=row.basis.sourceSteps.find(step=>step.stepId===input.stepId)?.source??'';return {inputId:input.inputId,stepId:input.stepId,kind:input.kind,intendedSlot:input.intendedSlot,value:input.provenance.kind==='sourceSpan'?source.slice(input.provenance.start,input.provenance.end):'unit-configuration-value'};
  }),secrets:{},secretOrigins:{},retainedArtifact:artifact};
  return {artifact,execute,launch,basis:row.basis};
}
export function retainedSecretReplay():ReturnType<typeof retainedReplay> {
  const h=retainedReplay(),action=h.artifact.learnedPlan.actions[2],step=h.artifact.steps[2],input=h.artifact.inputRecipes[1];
  if(!action||!step?.operations[0]||!input)throw new Error('SECRET_PROJECTION');
  const operation={kind:'fill' as const,value:{kind:'secretRef' as const,sourceInputId:'password-input'}};
  action.operation=operation;action.locator=null;action.operationHash=hashObserved({coordinate:action.coordinate,origin:action.origin,locator:null,operation});step.operations[0].operation=operation;h.artifact.guards[2]={guardId:'g2',origin:action.origin,target:{kind:'passwordControl'}};
  h.artifact.inputRecipes[1]={inputId:'password-input',stepId:input.stepId,kind:'secretRef',intendedSlot:'fill.value',provenance:{kind:'configuration',referenceId:'password-reference',referenceName:'PASS'}};h.artifact.replayPolicy.inputs=h.artifact.inputRecipes;
  h.artifact.learnedPlanHash=hashObserved(h.artifact.learnedPlan);h.artifact.replayPolicy.learnedPlanHash=h.artifact.learnedPlanHash;
  Object.assign(h.launch.admission.request,{artifactHash:hashObserved(h.artifact),learnedPlanHash:h.artifact.learnedPlanHash,referencePolicyHash:hashObserved(h.artifact.replayPolicy)});
  h.execute.steps=structuredClone(h.artifact.steps);h.execute.guards=structuredClone(h.artifact.guards);h.execute.inputs[1]={inputId:'password-input',stepId:input.stepId,kind:'secretRef',intendedSlot:'fill.value',referenceName:'PASS'};h.execute.secrets={PASS:'released-secret-canary'};h.execute.secretOrigins={PASS:[action.origin??'']};return h;
}
