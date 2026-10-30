import { authoringReferences } from './observedSnapshots.js';
import type { GuardSourceAuthorization, ObservedPage, PreparationFact, ValidationBasis, AcceptedTranslationPlan } from '../executor/observedOperations.js';
import { demand, equalObserved, hashObserved } from './observedReferencePolicy.js';
import { shownRefsOf } from './outlineRefs.js';

type Fact = ObservedPage['facts'][string];
type Obligation = AcceptedTranslationPlan['obligations'][number];
const same = (a: unknown, b: unknown): void => { demand(equalObserved(a, b), 'EVIDENCE_MISMATCH'); };
export const guardNormalize = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const phrase = (text: string, needle: string): boolean => needle !== '' && ` ${guardNormalize(text)} `.includes(` ${guardNormalize(needle)} `);
const generic = new Set(['page','region','row','cell','table','text','value','label','field','heading','content','section','application','data']);
const SOURCE_ROLES = new Set(['form','dialog','alertdialog','region','search','navigation','main','row','article','listitem','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','complementary','list','heading','cell','gridcell','rowheader','columnheader','text','paragraph','strong','status','link']);

/** Validate the full current class before matching even one selected ref. Ref order comes from the
 * outline after removing quoted strings, never from object key order or a bracket in a label. */
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-boolean-literal-compare -- Keep true-only metadata validation defensive for runtime objects.
    if (fact.directTextAssertion) demand(fact.directTextAssertion === true && fact.role === 'paragraph' && fact.name === '' && !fact.editable && fact.ownTextComplete && ownText(fact) !== '', 'EVIDENCE_MISMATCH');
    for (const [sources, readOnly] of [[fact.scopeRefs, false], [fact.readScope?.sourceRefs, true]] as const) {
      if (!sources) continue;
      demand(sources.length >= 1 && sources.length <= 8 && new Set(sources).size === sources.length, 'EVIDENCE_MISMATCH');
      for (const sourceRef of sources) {
        const source = o.facts[sourceRef];
        demand(sourceRef !== ref && source && source.nameComplete && source.name !== '' && Array.from(source.name).length <= 80
          && (SOURCE_ROLES.has(source.role) || readOnly && sourceRef === fact.readScope?.tableTitleRef && source.role === 'caption')
          && !source.editable && !['textbox','searchbox','combobox','checkbox','button'].includes(source.role), 'EVIDENCE_MISMATCH');
        const sourceLine = firstLineByRef.get(sourceRef);
        demand(sourceLine && !sourceLine.includes('{value withheld}'), 'EVIDENCE_MISMATCH');
      }
    }
    if (fact.nearSource) demand(fact.readScope?.relation === 'R7_ADJACENT_PUBLIC' && fact.evidenceSegments.some(s => s.field === 'near' && s.purpose === 'READ_ASSERT_ONLY'), 'EVIDENCE_MISMATCH');
    if (fact.readScope?.tableTitleRef) demand(fact.readScope.relation === 'SAME_ROW_LABEL' && fact.readScope.sourceRefs.length >= 2 && fact.readScope.sourceRefs.includes(fact.readScope.tableTitleRef)
      && fact.readScope.tableTitleRef !== ref, 'EVIDENCE_MISMATCH');
  }
}
export function publicScopeHash(o: ObservedPage, fact: Fact): string | undefined {
  if (!fact.scopeRefs?.length) return undefined;
  return hashObserved(fact.scopeRefs.map(ref => {
    const source = o.facts[ref]; demand(source?.nameComplete, 'EVIDENCE_MISMATCH');
    return { role: source.role, name: source.name, ...(source.ordinal ? { ordinal: source.ordinal } : {}) };
  }));
}
export function qualifiedScopeAllows(o: ObservedPage, fact: Fact, scope: string | null, kind: string): boolean {
  if (scope === null) return true;
  const wanted = guardNormalize(scope); if (!wanted) return false;
  const exact = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  const described = exact(scope), descriptor = /^infobox for (.+)$/u.exec(described);
  if (descriptor || described.startsWith('infobox for')) {
    const title = fact.readScope?.tableTitleRef ? o.facts[fact.readScope.tableTitleRef] : undefined;
    return (kind === 'read' || kind === 'assert') && fact.readScope?.relation === 'SAME_ROW_LABEL' && fact.readScope.sourceRefs.length >= 2
      && fact.readScope.tableTitleRef !== undefined && fact.readScope.sourceRefs.includes(fact.readScope.tableTitleRef) && descriptor !== null
      && title?.nameComplete === true && exact(title.name) === descriptor[1]
      && !guardNormalize(descriptor[1]).split(' ').every(word => generic.has(word));
  }
  if (fact.scopeRefs?.some(ref => { const s = o.facts[ref]; return s?.nameComplete && guardNormalize(s.name) === wanted; })) return true;
  if (kind !== 'read' && kind !== 'assert' || wanted.split(' ').every(word => generic.has(word))) return false;
  return fact.readScope?.sourceRefs.some(ref => { const s = o.facts[ref]; return s?.nameComplete && phrase(s.name, wanted); }) === true;
}
export function ownText(fact: Fact): string {
  const parts = fact.evidenceSegments.filter(p => p.field === 'ownText');
  demand(parts.length <= 1, 'EVIDENCE_MISMATCH');
  const part = parts[0]; if (!part) return '';
  const { start, end } = part, text = fact.evidence;
  const boundary = (i: number): boolean => i === 0 || i === text.length || !(text.charCodeAt(i - 1) >= 0xd800 && text.charCodeAt(i - 1) <= 0xdbff && text.charCodeAt(i) >= 0xdc00 && text.charCodeAt(i) <= 0xdfff);
  demand(start >= 0 && end >= start && end <= text.length && boundary(start) && boundary(end) && part.purpose === undefined, 'EVIDENCE_MISMATCH');
  return text.slice(start, end);
}
export const DESTRUCTIVE_TERMS = ['delete','remove','erase','destroy','purge','pay','transfer','send money','submit order','place order','confirm payment','cancel subscription','close account','deactivate','revoke'] as const;
const destructive = (fact: Fact): readonly string[] => DESTRUCTIVE_TERMS.filter(term => phrase(fact.name, term) || phrase(ownText(fact), term));
const factOf = (b: ValidationBasis, p: PreparationFact): Fact => {
  demand(p.proposal.target.kind === 'node' && p.observationHash !== null, 'EVIDENCE_MISMATCH');
  const observation = b.observations.find(o => o.observationHash === p.observationHash)?.observation;
  const fact = observation?.facts[p.proposal.target.ref]; demand(fact, 'EVIDENCE_MISMATCH'); return fact;
};
/** GuidedGates.intent/allowedFact for inherited effects. Scope-only context cannot supply intent.
 * Keep interior punctuation and symbol-only names: guardNormalize serves a different predicate. */
function publicEffectIntentAllows(intent: string | null, fact: Fact): boolean {
  const norm = (value: string): string => {
    const folded = value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
    const stripped = folded.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
    return stripped === '' ? folded : stripped;
  };
  if (intent === null || norm(intent) === '') return false;
  if (norm(intent) === norm(fact.name)) return true;
  const words = (value: string): string[] => norm(value).split(/[^\p{L}\p{N}]+/u).filter(word => Array.from(word).length >= 2);
  const wanted = words(intent);
  if (wanted.length === 0) return false;
  const evidence = fact.evidenceSegments.filter(segment => segment.purpose === undefined
    && segment.start >= 0 && segment.end >= segment.start && segment.end <= fact.evidence.length)
    .map(segment => fact.evidence.slice(segment.start, segment.end)).join(' ');
  const allowed = new Set(words(evidence));
  return wanted.every(word => allowed.has(word));
}
export function validatePreparationScope(b: ValidationBasis, p: PreparationFact, ob: Obligation): void {
  if (p.proof.target) {
    const child = p.proof.target.locator.some(step => step.by === 'filterHas' && Object.hasOwn(step, 'relation'));
    demand(!child || p.proposal.operation.kind === 'read' || p.proposal.operation.kind === 'assert', 'OPERATION_MISMATCH');
  }
  if (p.proposal.target.kind !== 'node') return;
  const o = b.observations.find(o => o.observationHash === p.observationHash)?.observation;
  demand(o && qualifiedScopeAllows(o, factOf(b, p), ob.scopeIntent, p.proposal.operation.kind), 'EVIDENCE_MISMATCH');
}
/** Public reconstruction verifies every immutable join and input eligibility. Saved lexical membership
 * is explicitly entrusted to the authenticated backend source authority: declaration hashes commit to
 * public metadata and do not prove anything about a hidden value. No private value is reconstructed. */
export function validatePressInheritance(b: ValidationBasis): void {
  const used = new Set<string>();
  for (const action of b.actions) {
    const current = b.preparations.find(p => p.preparationId === action.preparationId); demand(current, 'EVIDENCE_MISMATCH');
    const inherited = current.proof.pressInheritance;
    if (inherited === null) continue;
    const p = current.proposal, key = action.ledger.admission.admissionId;
    demand(p.operation.kind === 'press' && p.target.kind === 'node' && p.coordinate.ordinal === 0, 'EVIDENCE_MISMATCH');
    const at = b.sourceSteps.findIndex(s => s.stepId === p.coordinate.stepId), source = b.sourceSteps[at];
    demand(at > 0 && source && new RegExp(`^press\\s+(?:the\\s+)?${p.operation.key}(?:\\s+key)?[.!]?$`, 'iu').test(source.source.trim()), 'EVIDENCE_MISMATCH');
    const previousStep = b.sourceSteps[at - 1]; demand(previousStep, 'EVIDENCE_MISMATCH');
    const priorActions = b.actions.filter(a => a.ledger.coordinate.stepId === previousStep.stepId);
    demand(priorActions.length === 1 && b.actions.filter(a => a.ledger.coordinate.stepId === source.stepId).length === 1, 'EVIDENCE_MISMATCH');
    const priorAction = priorActions[0]; demand(priorAction, 'EVIDENCE_MISMATCH');
    const prior = b.preparations.find(prep => prep.preparationId === priorAction.preparationId); demand(prior, 'EVIDENCE_MISMATCH');
    const pp = prior.proposal, pl = priorAction.ledger;
    demand(['fill','click','check'].includes(pp.operation.kind) && pp.target.kind === 'node' && pp.coordinate.ordinal === 0
      && !(pp.operation.kind === 'fill' && pp.operation.value.kind === 'secretRef') && prior.proof.pressInheritance === null
      && pl.state === 'SUCCEEDED' && pl.outcomeCode === 'OK' && pl.dispatchCount === 1 && pl.attemptOrdinal === 0 && action.ledger.attemptOrdinal === 0
      && pp.target.documentId === p.target.documentId && pp.executionEvidence.origin === p.executionEvidence.origin && prior.proof.contextId === current.proof.contextId
      && prior.proof.contextRevision === current.proof.contextRevision && prior.proof.authoredInputsHash === current.proof.authoredInputsHash
      && prior.proof.workerId === current.proof.workerId && prior.proof.ownerFence === current.proof.ownerFence, 'EVIDENCE_MISMATCH');
    same(inherited, { kind: 'same-element-press', predecessorAdmissionId: pl.admission.admissionId, predecessorRequestDigest: pl.requestDigest, predecessorOperationHash: pl.operationHash, predecessorCoordinate: pl.coordinate, documentId: p.target.documentId });
    const currentOb = b.translationPlan.obligations.find(o => o.obligationId === action.obligationId), priorOb = b.translationPlan.obligations.find(o => o.obligationId === priorAction.obligationId);
    demand(currentOb && priorOb && currentOb.targetIntent === priorOb.targetIntent, 'EVIDENCE_MISMATCH');
    const oldFact = factOf(b, prior), fact = factOf(b, current);
    demand(publicEffectIntentAllows(priorOb.targetIntent, oldFact) && publicEffectIntentAllows(currentOb.targetIntent, fact), 'EVIDENCE_MISMATCH');
    const priorObservation = b.observations.find(o => o.observationHash === prior.observationHash)?.observation, currentObservation = b.observations.find(o => o.observationHash === current.observationHash)?.observation;
    demand(priorObservation && currentObservation, 'EVIDENCE_MISMATCH');
    same(publicScopeHash(priorObservation, oldFact) ?? null, publicScopeHash(currentObservation, fact) ?? null);
    // A site script may turn the filled search box into a combobox once it is used: the text-entry roles are one role (the backend does the same).
    const entryRole = (role: string): string => ['textbox', 'searchbox', 'combobox'].includes(role) ? 'text-entry' : role;
    same({ role: entryRole(oldFact.role), name: oldFact.name, evidence: oldFact.evidence, ordinal: oldFact.ordinal ?? null }, { role: entryRole(fact.role), name: fact.name, evidence: fact.evidence, ordinal: fact.ordinal ?? null });
    demand(oldFact.nameComplete && oldFact.ownTextComplete && fact.nameComplete && fact.ownTextComplete, 'EVIDENCE_MISMATCH');
    demand(!(b.incrementalEvidence?.excludedAttempts ?? []).some(a => [source.stepId,previousStep.stepId].includes(a.action.ledger.coordinate.stepId)), 'EVIDENCE_MISMATCH');
    const witnesses = b.guardAuthorizations.filter(w => w.pressAdmissionId === key); demand(witnesses.length === 1 && !used.has(key), 'EVIDENCE_MISMATCH');
    const w = witnesses[0]; demand(w, 'EVIDENCE_MISMATCH'); used.add(key);
    same(w.predecessorAdmissionId, pl.admission.admissionId); same(w.pressPreparationId, current.preparationId); same(w.predecessorPreparationId, prior.preparationId);
    same(w.pressProofHash, hashObserved(current.proof)); same(w.predecessorProofHash, hashObserved(prior.proof)); same(w.pressObservationHash, current.observationHash); same(w.predecessorObservationHash, prior.observationHash);
    same(w.sourceManifestHash, b.sourceManifestHash); same(w.sourceIdentityHash, hashObserved(b.snapshotEvidence.current));
    for (const field of ['contextId','sourceRevision','configurationRevision','workerId','authoredInputsHash','scopeHash','contextRevision','ownerFence'] as const) same(w[field], current.proof[field]);
    const sourceEligible = (proof: GuardSourceAuthorization['predecessorGrounding']['source'], stepId: string): string | null => {
      same(proof.stepId, stepId);
      if (proof.kind === 'AUTHORED') { const step = b.sourceSteps.find(s => s.stepId === stepId); demand(step, 'EVIDENCE_MISMATCH'); return step.source; }
      const declaration = b.snapshotEvidence.current.authoredDeclarations.find(d => d.referenceId === proof.declarationId);
      demand(declaration?.kind === 'plain' && hashObserved(declaration) === proof.declarationHash, 'EVIDENCE_MISMATCH');
      const identity = b.snapshotEvidence.current, step = identity.authoring.steps.find(s => s.id === stepId);
      demand(step, 'EVIDENCE_MISMATCH');
      const allowed = [...authoringReferences(identity, identity.authoring.globalContext), ...authoringReferences(identity, step.context, step.text)];
      demand(allowed.some(d => d.kind === 'plain' && d.referenceId === proof.declarationId && hashObserved(d) === proof.declarationHash), 'EVIDENCE_MISMATCH');
      return null; // Hidden membership was rechecked by private-source authority before this witness was sealed.
    };
    const ground = w.predecessorGrounding, authored = sourceEligible(ground.source, previousStep.stepId);
    const label = ground.field === 'NAME' ? oldFact.name : ground.field === 'OWN_TEXT' ? ownText(oldFact) : oldFact.role;
    demand((ground.field === 'ROLE') === (ground.mode === 'ROLE'), 'EVIDENCE_MISMATCH');
    demand(label !== '' && (ground.field !== 'ROLE' || oldFact.name === '' && ownText(oldFact) === '' && ground.mode === 'ROLE'), 'EVIDENCE_MISMATCH');
    if (authored !== null) demand(ground.mode === 'ALL_WORDS' ? guardNormalize(label).split(' ').every(word => guardNormalize(authored).split(' ').includes(word)) : phrase(authored, label), 'EVIDENCE_MISMATCH');
    for (const [entries, target, stepId] of [[w.predecessorDestructive, oldFact, previousStep.stepId], [w.currentDestructive, fact, source.stepId]] as const) {
      same(entries.map(e => e.verb), destructive(target));
      for (const entry of entries) { const text = sourceEligible(entry.source, stepId); if (text !== null) demand(phrase(text, entry.verb), 'EVIDENCE_MISMATCH'); }
    }
  }
  demand(used.size === b.guardAuthorizations.length, 'EVIDENCE_MISMATCH');
}
