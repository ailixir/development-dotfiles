import type { AuthoringSnapshotIdentity, Configuration, Declaration, LearnedPlan, ObservedPage, ValidationBasis, PrefixProgram } from '../executor/observedOperations.js';
import { demand, equalObserved, hashObserved } from './observedReferencePolicy.js';
import { shownRefsOf } from './outlineRefs.js';
const same = (a: unknown, b: unknown): void => { demand(equalObserved(a, b), 'EVIDENCE_MISMATCH'); };
function omit<T extends object,K extends keyof T>(value:T,keys:readonly K[]):Omit<T,K> { const excluded=new Set<PropertyKey>(keys);return Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.has(key))) as Omit<T,K>; }
const sort = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
/** Frozen source identity only. No current variable lookup or materialized value reconstruction. */
/** Resolve only immutable public declaration eligibility; no argument materialization or private
 * value is required for a saved source legitimately referenced by the step/global authoring context. */
export function authoringReferences(identity: AuthoringSnapshotIdentity, context: AuthoringSnapshotIdentity['authoring']['steps'][number]['context'], text?: string): Declaration[] {
  const declarations = new Map(identity.authoredDeclarations.map(d => [d.referenceId, d]));
  demand(declarations.size === identity.authoredDeclarations.length, 'EVIDENCE_MISMATCH');
  const local = new Map<string, Declaration>();
  const add = (id: string, kind: Declaration['kind'], direct = false): void => {
    const declaration = direct ? identity.authoredDeclarations.find(d => d.kind === 'secretRef' && d.secretId === id && d.referenceId === id) : declarations.get(id);
    demand(declaration?.kind === kind, 'REFERENCE_MISMATCH'); local.set(declaration.referenceId, declaration);
  };
  for (const item of context.entries) {
    const entry = item.kind === 'default' ? item.value : item;
    if (entry.kind === 'variableRef') add(entry.referenceId, 'plain');
    if (entry.kind === 'secretRef') add(entry.referenceId, 'secretRef');
  }
  for (const token of text?.matchAll(/<var\s+([A-Za-z0-9_.-]{1,64})>/gu) ?? []) add(token[1] ?? '', 'plain');
  for (const token of text?.matchAll(/<secret\s+([A-Za-z0-9_.-]{1,64})>/gu) ?? []) add(token[1] ?? '', 'secretRef', true);
  return [...local.values()].sort((a,b) => sort(a.referenceId,b.referenceId));
}
export function inputChains(identity: AuthoringSnapshotIdentity, configuration: Configuration): string[] {
  const used = new Map<string, Declaration>();
  const collect = (context: AuthoringSnapshotIdentity['authoring']['steps'][number]['context'], text?: string): Declaration[] => {
    const references = authoringReferences(identity, context, text);
    for (const declaration of references) { const prior = used.get(declaration.referenceId); demand(!prior || equalObserved(prior,declaration),'REFERENCE_MISMATCH'); used.set(declaration.referenceId,declaration); }
    return references;
  };
  const globalReferences = collect(identity.authoring.globalContext);
  let previous = hashObserved({ domain: 'studio.test-config', version: 1, ...configuration, globalContextHash: hashObserved(identity.authoring.globalContext), globalReferences });
  const chains = identity.authoring.steps.map(step => {
    const references = collect(step.context, step.text);
    const stepInputHash = hashObserved({ domain: 'studio.step-input', version: 1, stepId: step.id, text: step.text, context: step.context, references });
    previous = hashObserved({ domain: 'studio.step-chain', version: 1, stepId: step.id, stepInputHash, previous });
    return previous;
  });
  same([...used.values()].sort((a,b) => sort(a.referenceId,b.referenceId)), identity.authoredDeclarations);
  return chains;
}
export function stepSnapshots(identity: AuthoringSnapshotIdentity, configuration: Configuration, plan: Pick<LearnedPlan, 'actions' | 'bindings'>): Record<string,string> {
  const chains = inputChains(identity, configuration);
  return Object.fromEntries(identity.authoring.steps.map((step,index) => {
    const actions = plan.actions.filter(a => a.coordinate.stepId === step.id).sort((a,b) => a.coordinate.ordinal-b.coordinate.ordinal).map(a => omit(a,['admissionId']));
    const producedBindings = plan.bindings.filter(b => b.producer.stepId === step.id).sort((a,b) => a.producer.ordinal-b.producer.ordinal || sort(a.bindingId,b.bindingId)).map(b => ({...omit(b,['consumers']),provenance:omit(b.provenance,['sessionId','producerAdmissionId'])}));
    const consumedBindings = plan.bindings.flatMap(b => b.consumers).filter(e => e.coordinate.stepId === step.id).sort((a,b) => a.coordinate.ordinal-b.coordinate.ordinal || sort(a.bindingId,b.bindingId)).map(e => omit(e,['producerAdmissionId','consumerAdmissionId']));
    return [step.id, hashObserved({ domain: 'studio.step-snapshot', version: 1, stepId: step.id, inputChain: chains[index], learnedStepHash: hashObserved({ actions, producedBindings, consumedBindings }) })];
  }));
}
function expectedProgram(base: NonNullable<ValidationBasis['snapshotEvidence']['baseProof']>, pin: NonNullable<ValidationBasis['snapshotEvidence']['pinnedBase']>, ids: readonly string[]): PrefixProgram {
  return { schemaVersion: 3, baseRevisionId: pin.revisionId, baseRevisionDigest: pin.revisionDigest, sourceStepIds: ids, actions: base.artifact.learnedPlan.actions.filter(a => ids.includes(a.coordinate.stepId)).map(action => { const a=omit(action,['admissionId']);
    const replay = base.artifact.steps.flatMap(s => s.operations).filter(o => equalObserved(o.coordinate,a.coordinate));
    demand(replay.length === 1, 'EVIDENCE_MISMATCH');
    const guard = base.artifact.guards.find(g => g.guardId === replay[0]?.guardId); demand(guard, 'EVIDENCE_MISMATCH');
    return { ...a, guard };
  }) };
}
/** Reconstruct current and immediate immutable base maps before any candidate hash exists. */
export function deriveSnapshotMaps(b: ValidationBasis, plan: Pick<LearnedPlan,'actions'|'bindings'>): Pick<LearnedPlan,'stepSnapshotHashes'|'reusedFrom'|'incremental'> {
  const proof = b.snapshotEvidence, current = proof.current;
  same(current.authoring.steps.map((s,ordinal) => ({ stepId:s.id, ordinal, source:s.text })), b.sourceSteps);
  const stepSnapshotHashes = stepSnapshots(current,b.configuration,plan), reusedFrom: Record<string,{ revisionId:string;stepId:string }> = {};
  const incremental = b.incrementalEvidence;
  if (!incremental) { same(proof.pinnedBase,null); same(proof.baseProof,null); return { stepSnapshotHashes,reusedFrom,incremental:null }; }
  const { plan: initial, program, switch: change } = incremental, pin = proof.pinnedBase;
  demand(pin && initial.sessionId === b.sessionId && initial.testId === b.testId && initial.csiId === b.csiId && change.sessionId === b.sessionId, 'EVIDENCE_MISMATCH');
  same(initial.baseRevisionId,pin.revisionId); same(program.baseRevisionId,pin.revisionId); same(program.baseRevisionDigest,pin.revisionDigest); same(change.baseRevisionId,pin.revisionId); same(hashObserved(program),initial.prefixProgramHash);
  const original = initial.initialFirstLearnIndex, effective = change.effectiveFirstLearnIndex;
  demand(original >= 0 && original < b.sourceSteps.length && effective >= 0 && effective <= original && change.completedPrefixCount === effective, 'EVIDENCE_MISMATCH');
  same(b.sourceSteps[original]?.stepId,initial.initialFirstLearnStepId); same(change.initialFirstLearnStepId,initial.initialFirstLearnStepId); same(b.sourceSteps[effective]?.stepId,change.effectiveFirstLearnStepId);
  if (change.reason !== 'DRIFT') { demand(effective === original && change.nextSemanticOrdinal === 0 && incremental.driftReceipt === null && change.driftReceiptHash === null && incremental.excludedAttempts.length === 0, 'EVIDENCE_MISMATCH'); }
  else { demand(effective < original && incremental.driftReceipt, 'EVIDENCE_MISMATCH'); const { receiptHash,...body } = incremental.driftReceipt; same(hashObserved(body),receiptHash); same(receiptHash,change.driftReceiptHash); same(body.coordinate,{ stepId:change.effectiveFirstLearnStepId,ordinal:change.nextSemanticOrdinal }); }
  if (original === 0) {
    demand(change.reason === 'EMPTY_PREFIX' && !proof.baseProof && program.actions.length === 0 && program.sourceStepIds.length === 0 && incremental.prefixRequests.length === 0 && change.retainedPrefixAdmissionIds.length === 0, 'EVIDENCE_MISMATCH');
  } else {
    const base = proof.baseProof; demand(base,'EVIDENCE_MISMATCH'); const revision = base.revision, identity = revision.identity, artifact = base.artifact;
    same(revision.id,pin.revisionId); same(revision.revisionDigest,pin.revisionDigest); same(hashObserved(identity),pin.revisionDigest); same(identity.testId,b.testId); same(identity.csiId,b.csiId);
    same(hashObserved(base.authoringIdentity.authoring.steps.map(s=>s.text)),identity.sourceHash); same(hashObserved(base.authoringIdentity.authoring.steps.map((s,ordinal)=>({stepId:s.id,ordinal,source:s.text}))),identity.authoringHash);
    same(hashObserved(base.configuration),identity.configurationHash); same(hashObserved(artifact),identity.artifactHash); same(hashObserved(artifact.learnedPlan),identity.learnedPlanHash); same(artifact.learnedPlanHash,identity.learnedPlanHash); same(hashObserved(artifact.replayPolicy),identity.referencePolicyHash); same(hashObserved(artifact.profile),identity.profileHash);
    for (const key of ['sourceHash','configurationHash','authoringHash'] as const) same(artifact[key],identity[key]);
    for (const key of ['admissionProvenanceHash','publicationEvidenceHash','runAuthorizationHash'] as const) same(artifact.replayPolicy[key],identity[key]);
    same(hashObserved({ operations:artifact.steps.flatMap(s=>s.operations),guards:artifact.guards,inputRecipes:artifact.inputRecipes,bindings:artifact.replayPolicy.bindings,transfers:artifact.replayPolicy.transfers }),identity.operationEquivalenceHash);
    same(stepSnapshots(base.authoringIdentity,base.configuration,artifact.learnedPlan),revision.stepSnapshotHashes); same(revision.stepSnapshotHashes,artifact.learnedPlan.stepSnapshotHashes); same(revision.reusedFrom,artifact.learnedPlan.reusedFrom);
    const oldChains = inputChains(base.authoringIdentity,base.configuration), chains = inputChains(current,b.configuration);
    let boundary = chains.findIndex((chain,i)=>chain!==oldChains[i] || current.authoring.steps[i]?.id!==base.authoringIdentity.authoring.steps[i]?.id);
    if (boundary < 0 && chains.length !== oldChains.length) boundary=Math.min(chains.length,oldChains.length)-1;
    demand(boundary < 0 || original <= boundary,'EVIDENCE_MISMATCH');
    const ids = current.authoring.steps.slice(0,original).map(s=>s.id); same(ids,base.authoringIdentity.authoring.steps.slice(0,original).map(s=>s.id)); same(program,expectedProgram(base,pin,ids));
    for (const id of ids.slice(0,effective)) { same(stepSnapshotHashes[id],(revision.stepSnapshotHashes as Record<string,string>)[id]); reusedFrom[id]={revisionId:pin.revisionId,stepId:id}; }
  }
  const retained = b.actions.filter(a=> { const index=b.sourceSteps.findIndex(s=>s.stepId===a.ledger.coordinate.stepId);return index<effective || index===effective && a.ledger.coordinate.ordinal<change.nextSemanticOrdinal; }).map(a=> {
    const originalAction=program.actions.find(p=>equalObserved(p.coordinate,a.ledger.coordinate)); demand(originalAction && originalAction.operationHash===a.ledger.operationHash,'EVIDENCE_MISMATCH'); return a.ledger.admission.admissionId;
  });
  same(retained,change.retainedPrefixAdmissionIds);same(hashObserved(retained),change.retainedPrefixAdmissionsHash);
  return {stepSnapshotHashes,reusedFrom,incremental:{baseRevisionId:pin.revisionId,initialFirstLearnStepId:initial.initialFirstLearnStepId,effectiveFirstLearnStepId:change.effectiveFirstLearnStepId,retainedPrefixAdmissionIds:retained,driftReceiptHash:change.driftReceiptHash}};
}

type Fact = ObservedPage['facts'][string];
const SOURCE_ROLES = new Set(['form','dialog','alertdialog','region','search','navigation','main','row','article','listitem','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','complementary','list','heading','cell','gridcell','rowheader','columnheader','text','paragraph','strong','status','link']);
/** The text of the fact's single ownText segment (the part of the evidence the node itself carries), checked for bounds and code points. */
export function ownText(fact: Fact): string {
  const parts = fact.evidenceSegments.filter(p => p.field === 'ownText');
  demand(parts.length <= 1, 'EVIDENCE_MISMATCH');
  const part = parts[0]; if (!part) return '';
  const { start, end } = part, text = fact.evidence;
  const boundary = (i: number): boolean => i === 0 || i === text.length || !(text.charCodeAt(i - 1) >= 0xd800 && text.charCodeAt(i - 1) <= 0xdbff && text.charCodeAt(i) >= 0xdc00 && text.charCodeAt(i) <= 0xdfff);
  demand(start >= 0 && end >= start && end <= text.length && boundary(start) && boundary(end) && part.purpose === undefined, 'EVIDENCE_MISMATCH');
  return text.slice(start, end);
}
/** Validate the full current class before matching even one selected ref. Ref order comes from the outline after removing quoted strings, never from object key order or a bracket in a label. */
export function validatePublicObservation(o: ObservedPage): void {
  const refs = [...shownRefsOf(o.outline)];
  const firstLineByRef = new Map<string,string>();
  for (const line of o.outline.split('\n')) {
    const bare = line.replace(/"(?:[^"\\]|\\.)*"/gu, '""');
    for (const match of bare.matchAll(/\[([A-Za-z0-9_-]+)\]/gu)) if (match[1] !== undefined && !firstLineByRef.has(match[1])) firstLineByRef.set(match[1], line);
  }
  const groups = new Map<string, { ref: string; fact: Fact }[]>();
  for (const ref of refs) {
    const fact = o.facts[ref]; demand(fact, 'EVIDENCE_MISMATCH');
    const key = hashObserved([fact.role, fact.name, fact.evidence]);
    const group = groups.get(key) ?? []; group.push({ ref, fact }); groups.set(key, group);
    ownText(fact);
  }
  for (const group of groups.values()) for (const [index, { ref, fact }] of group.entries()) {
    if (group.length === 1) demand(fact.ordinal === undefined, 'EVIDENCE_MISMATCH');
    else same(fact.ordinal, { index: index + 1, count: group.length });
    const line = firstLineByRef.get(ref);
    if (fact.ordinal) demand(line?.includes(`{ordinal=${String(fact.ordinal.index)}/${String(fact.ordinal.count)}}`), 'EVIDENCE_MISMATCH');
  }
  for (const [ref, fact] of Object.entries(o.facts)) {
    const sources = fact.scopeRefs;
    if (sources) {
      demand(sources.length >= 1 && sources.length <= 8 && new Set(sources).size === sources.length, 'EVIDENCE_MISMATCH');
      for (const sourceRef of sources) {
        const source = o.facts[sourceRef];
        demand(sourceRef !== ref && source && source.nameComplete && source.name !== '' && Array.from(source.name).length <= 80
          && SOURCE_ROLES.has(source.role) && !source.editable && !['textbox','searchbox','combobox','checkbox','button'].includes(source.role), 'EVIDENCE_MISMATCH');
        const sourceLine = firstLineByRef.get(sourceRef);
        demand(sourceLine && !sourceLine.includes('{value withheld}'), 'EVIDENCE_MISMATCH');
      }
    }
    if (fact.nearSource) demand(fact.evidenceSegments.some(s => s.field === 'near' && s.purpose === 'READ_ASSERT_ONLY'), 'EVIDENCE_MISMATCH');
  }
}
