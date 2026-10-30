import { describe, expect, it } from 'vitest';
import reference from '../../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import type { ValidationBasis } from '../../src/executor/observedOperations.js';
import type { TestDocument } from '../helpers/publicationFixture.js';
import { guardNormalize, publicScopeHash, qualifiedScopeAllows, validatePressInheritance, validatePublicObservation } from '../../src/validator/pressInheritance.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';

function must<T>(value: T | null | undefined): T { if (value === undefined || value === null) throw Error('MISSING_DECLARED_SYNTHETIC_FACT'); return value; }
it('source-line lookup ignores quoted false refs and retains the first actual line for a repeated ref', () => {
  const base = must(must(reference.basis.observations[0]).observation.facts.e1);
  const fact = (role: string, name: string) => ({ ...structuredClone(base), role, name, evidence: name, evidenceSegments: [{ field: 'name' as const, start: 0, end: name.length }], text: name });
  const observation = { facts: { e1: { ...fact('button','Continue'), scopeRefs: ['e2'] }, e2: fact('heading','Source'), e9: fact('heading','Noise [e2]') },
    outline: '- heading "Noise [e2]" [e9] {value withheld}\n- button "Continue" [e1]\n- heading "Source" [e2]' } as unknown as ValidationBasis['observations'][number]['observation'];
  expect(() => { validatePublicObservation(observation); }).not.toThrow();
  expect(() => { validatePublicObservation({ ...observation, outline: observation.outline.replace('- heading "Source" [e2]', '- heading "Source" [e2] {value withheld}\n- heading "Source" [e2]') }); }).toThrow('EVIDENCE_MISMATCH');
});
it('D2 closed infobox title scope cannot borrow a named region, effect scope or title-only source', () => {
  const o = structuredClone(must(reference.basis.observations[0]).observation) as TestDocument<ValidationBasis['observations'][number]['observation']>;
  const target = must(o.facts.e2), base = must(o.facts.e1);
  o.facts.e3 = { ...structuredClone(base), role: 'columnheader', name: 'Python', evidence: 'Python', evidenceSegments: [{ field: 'name', start: 0, end: 6 }], text: 'Python' };
  o.facts.e4 = { ...structuredClone(base), role: 'region', name: 'infobox for Python', evidence: 'infobox for Python', evidenceSegments: [{ field: 'name', start: 0, end: 18 }], text: 'infobox for Python' };
  o.outline += '\n- columnheader "Python" [e3]\n- region "infobox for Python" [e4]';
  target.scopeRefs = ['e4'];
  expect(qualifiedScopeAllows(o as ValidationBasis['observations'][number]['observation'], target as ValidationBasis['observations'][number]['observation']['facts'][string], 'infobox for Python', 'read')).toBe(false);
  target.readScope = { relation: 'SAME_ROW_LABEL', sourceRefs: ['e1','e3'], tableTitleRef: 'e3' };
  expect(qualifiedScopeAllows(o as ValidationBasis['observations'][number]['observation'], target as ValidationBasis['observations'][number]['observation']['facts'][string], 'infobox for Python', 'read')).toBe(true);
  expect(qualifiedScopeAllows(o as ValidationBasis['observations'][number]['observation'], target as ValidationBasis['observations'][number]['observation']['facts'][string], 'infobox for Python', 'click')).toBe(false);
  target.readScope.sourceRefs = ['e3'];
  expect(() => { validatePublicObservation(o as ValidationBasis['observations'][number]['observation']); }).toThrow('EVIDENCE_MISMATCH');
  expect(qualifiedScopeAllows(o as ValidationBasis['observations'][number]['observation'], target as ValidationBasis['observations'][number]['observation']['facts'][string], 'infobox for Python', 'read')).toBe(false);
});
it('caption authority belongs only to readScope even if generic scope arrays alias or contain equal JSON values', () => {
  const o = structuredClone(must(reference.basis.observations[0]).observation) as TestDocument<ValidationBasis['observations'][number]['observation']>;
  const target = must(o.facts.e2), label = must(o.facts.e1);
  o.facts.e3 = { ...structuredClone(label), role: 'caption', name: 'Python', evidence: 'Python', evidenceSegments: [{ field: 'name', start: 0, end: 6 }], text: 'Python' };
  o.outline += '\n- caption "Python" [e3]';
  target.readScope = { relation: 'SAME_ROW_LABEL', sourceRefs: ['e1','e3'], tableTitleRef: 'e3' };
  expect(() => { validatePublicObservation(o as ValidationBasis['observations'][number]['observation']); }).not.toThrow();
  target.scopeRefs = target.readScope.sourceRefs;
  expect(target.scopeRefs).toBe(target.readScope.sourceRefs);
  expect(() => { validatePublicObservation(o as ValidationBasis['observations'][number]['observation']); }).toThrow('EVIDENCE_MISMATCH');
  const cloned = JSON.parse(JSON.stringify(o)) as ValidationBasis['observations'][number]['observation'];
  expect(cloned.facts.e2?.scopeRefs).not.toBe(cloned.facts.e2?.readScope?.sourceRefs);
  expect(() => { validatePublicObservation(cloned); }).toThrow('EVIDENCE_MISMATCH');
});
/** Immutable-policy conformance only. No DB, callback, native or publication capability is claimed.
 * The complete publication endpoint is separately exercised by observedReplayValidation and Java joined tests. */
function policyFixture(): TestDocument<ValidationBasis> {
  const b = structuredClone(reference.basis) as TestDocument<ValidationBasis>;
  const previous = structuredClone(must(b.preparations.find(p => p.proposal.operation.kind === 'fill' && p.proposal.target.kind === 'node' && p.proof.target?.identity.name === 'Destination')));
  const previousAction = structuredClone(must(b.actions.find(a => a.preparationId === previous.preparationId)));
  const current = structuredClone(previous), currentAction = structuredClone(previousAction);
  const previousStep = previous.proposal.coordinate.stepId, currentStep = '00000000-0000-4000-8000-000000000009';
  b.sourceSteps = [{ stepId: previousStep, ordinal: 0, source: 'Fill Destination' }, { stepId: currentStep, ordinal: 1, source: 'Press the Enter key.' }];
  previous.proposal.coordinate = { stepId: previousStep, ordinal: 0 }; previousAction.ledger.coordinate = structuredClone(previous.proposal.coordinate);
  previous.proof.pressInheritance = null;
  current.preparationId = 'press-preparation'; current.proof.preparationId = current.preparationId; currentAction.preparationId = current.preparationId;
  current.proposal.operation = { kind: 'press', key: 'Enter' }; current.proposal.coordinate = { stepId: currentStep, ordinal: 0 };
  currentAction.ledger.coordinate = structuredClone(current.proposal.coordinate); currentAction.ledger.admission.admissionId = 'press-admission';
  currentAction.obligationId = 'press-obligation'; previousAction.obligationId = 'fill-obligation';
  current.proof.pressInheritance = { kind: 'same-element-press', predecessorAdmissionId: previousAction.ledger.admission.admissionId, predecessorRequestDigest: previousAction.ledger.requestDigest, predecessorOperationHash: previousAction.ledger.operationHash, predecessorCoordinate: previousAction.ledger.coordinate, documentId: previous.proposal.target.documentId };
  b.preparations = [current, previous]; // UUID/array order deliberately differs from source order.
  b.actions = [currentAction, previousAction];
  const template = must(b.translationPlan.obligations[0]);
  b.translationPlan.obligations = [{ ...template, obligationId: previousAction.obligationId, stepId: previousStep, occurrence: 0, operationKind: 'fill', targetIntent: 'Destination', scopeIntent: null }, { ...template, obligationId: currentAction.obligationId, stepId: currentStep, occurrence: 0, operationKind: 'press', targetIntent: 'Destination', scopeIntent: null }];
  b.incrementalEvidence = null;
  b.guardAuthorizations = [{ version: 1, pressAdmissionId: currentAction.ledger.admission.admissionId, predecessorAdmissionId: previousAction.ledger.admission.admissionId, pressPreparationId: current.preparationId, predecessorPreparationId: previous.preparationId, pressProofHash: hashObserved(current.proof), predecessorProofHash: hashObserved(previous.proof), pressObservationHash: must(current.observationHash), predecessorObservationHash: must(previous.observationHash), contextId: current.proof.contextId, sourceRevision: b.sourceRevision, configurationRevision: b.configurationRevision, workerId: current.proof.workerId, sourceManifestHash: b.sourceManifestHash, sourceIdentityHash: hashObserved(b.snapshotEvidence.current), authoredInputsHash: current.proof.authoredInputsHash, scopeHash: current.proof.scopeHash, contextRevision: current.proof.contextRevision, ownerFence: current.proof.ownerFence, predecessorGrounding: { field: 'NAME', mode: 'WHOLE_PHRASE', source: { kind: 'AUTHORED', stepId: previousStep } }, predecessorDestructive: [], currentDestructive: [] }];
  return b;
}
const check = (b: TestDocument<ValidationBasis>): void => { validatePressInheritance(b as ValidationBasis); };
const resealProofs = (b: TestDocument<ValidationBasis>): void => {
  b.translationHash = hashObserved(b.translationPlan);
  const witness = must(b.guardAuthorizations[0]); witness.pressProofHash = hashObserved(must(b.preparations.find(p => p.preparationId === witness.pressPreparationId)).proof); witness.predecessorProofHash = hashObserved(must(b.preparations.find(p => p.preparationId === witness.predecessorPreparationId)).proof);
};
describe('independent inherited press policy reconstruction', () => {
  it('rejects coherently rehashed equal intents unrelated to both public targets', () => {
    const b = policyFixture(); resealProofs(b); expect(() => { check(b); }).not.toThrow();
    for (const obligation of b.translationPlan.obligations) obligation.targetIntent = 'Unrelated recipient';
    resealProofs(b);
    expect(b.translationHash).toBe(hashObserved(b.translationPlan));
    expect(must(b.translationPlan.obligations[0]).targetIntent).toBe(must(b.translationPlan.obligations[1]).targetIntent);
    expect(() => { check(b); }).toThrow('EVIDENCE_MISMATCH');
  });
  it.each([
    { name: 'Destination', intent: ' ＤＥＳＴＩＮＡＴＩＯＮ! ', evidence: 'Destination', marked: false, allowed: true },
    { name: 'Destination', intent: 'recipient details', evidence: 'Recipient account details', marked: false, allowed: true },
    { name: 'Destination', intent: 'recipient details', evidence: 'Recipient account details', marked: true, allowed: false },
    { name: 'Destination', intent: 'recipient absent', evidence: 'Recipient account details', marked: false, allowed: false },
    { name: 'Destination', intent: ' \u00a0\t ', evidence: 'Destination', marked: false, allowed: false },
    { name: '++', intent: '++', evidence: 'Unrelated', marked: true, allowed: true },
    { name: '++', intent: '--', evidence: 'Unrelated', marked: false, allowed: false },
    { name: 'a-b', intent: 'a b', evidence: 'a b', marked: false, allowed: false },
    { name: 'Destination', intent: '𐐀𐐁', evidence: '𐐀𐐁', marked: false, allowed: true },
  ])('matches ordinary public intent semantics for $name / $intent (marked=$marked)', ({ name, intent, evidence, marked, allowed }) => {
    // This is the isolated immutable-policy fixture, not a publication artifact or native witness.
    const b = policyFixture();
    for (const obligation of b.translationPlan.obligations) obligation.targetIntent = intent;
    // A real own-text label independently preserves the existing authored-source grounding gate,
    // including when the native accessible name contains only symbols.
    must(b.guardAuthorizations[0]).predecessorGrounding.field = 'OWN_TEXT';
    for (const preparation of b.preparations) {
      if (preparation.proposal.target.kind !== 'node') throw Error('EXPECTED_NODE');
      const row = must(b.observations.find(o => o.observationHash === preparation.observationHash));
      const fact = must(row.observation.facts[must(preparation.proposal.target.ref)]);
      fact.name = name; fact.evidence = `Destination ${evidence}`;
      fact.evidenceSegments = [{ field: 'ownText', start: 0, end: 11 }, { field: marked ? 'near' : 'text', start: 12, end: fact.evidence.length, ...(marked ? { purpose: 'READ_ASSERT_ONLY' } : {}) }];
    }
    resealProofs(b);
    if (allowed) expect(() => { check(b); }).not.toThrow();
    else expect(() => { check(b); }).toThrow('EVIDENCE_MISMATCH');
  });
  it('does not recover effect intent from unsegmented evidence or invalid segment ranges', () => {
    for (const segments of [[], [{ field: 'text', start: -1, end: 9 }], [{ field: 'text', start: 0, end: 1000 }]]) {
      const b = policyFixture();
      for (const obligation of b.translationPlan.obligations) obligation.targetIntent = 'recipient';
      for (const preparation of b.preparations) {
        if (preparation.proposal.target.kind !== 'node') throw Error('EXPECTED_NODE');
        const row = must(b.observations.find(o => o.observationHash === preparation.observationHash));
        const fact = must(row.observation.facts[must(preparation.proposal.target.ref)]);
        fact.evidence = 'Recipient'; fact.evidenceSegments = segments;
      }
      resealProofs(b); expect(() => { check(b); }).toThrow('EVIDENCE_MISMATCH');
    }
  });
  it('combined publication reconstructs immutable predecessor and source joins', () => {
    const b = policyFixture(); expect(() => { check(b); }).not.toThrow();
    for (const mutate of [
      (b: TestDocument<ValidationBasis>) => { must(b.guardAuthorizations[0]).predecessorGrounding.mode = 'ROLE'; },
      (b: TestDocument<ValidationBasis>) => { must(b.guardAuthorizations[0]).predecessorAdmissionId = 'another-success'; },
      (b: TestDocument<ValidationBasis>) => { must(b.preparations[1]).proof.contextRevision++; },
      (b: TestDocument<ValidationBasis>) => { must(b.sourceSteps[1]).source = 'Click Destination then press Enter'; },
      (b: TestDocument<ValidationBasis>) => { must(b.preparations[1]).proposal.operation = { kind: 'read', bindingId: 'extra', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: 'rule' } }; },
      (b: TestDocument<ValidationBasis>) => { must(b.actions[1]).ledger.attemptOrdinal = 1; },
      (b: TestDocument<ValidationBasis>) => { must(b.actions[1]).ledger.state = 'UNKNOWN_OUTCOME'; },
      (b: TestDocument<ValidationBasis>) => { must(b.translationPlan.obligations[1]).targetIntent = 'Another control'; },
      (b: TestDocument<ValidationBasis>) => { b.guardAuthorizations.push(structuredClone(must(b.guardAuthorizations[0]))); },
      (b: TestDocument<ValidationBasis>) => { b.actions.push(structuredClone(must(b.actions[1]))); },
    ]) { const altered = structuredClone(b); mutate(altered); resealProofs(altered); expect(() => { check(altered); }).toThrow(); }
    const hiddenClaim = structuredClone(b), ground = must(hiddenClaim.guardAuthorizations[0]).predecessorGrounding;
    ground.source = { kind: 'SAVED_INPUT', stepId: must(b.sourceSteps[0]).stepId, declarationId: 'invented', declarationHash: 'a'.repeat(64) };
    expect(() => { check(hiddenClaim); }).toThrow(); // Public hash alone never establishes input eligibility.
  });
  it('reads the text-entry roles as one role when a script turned the filled search box into a combobox', () => {
    const b = policyFixture(), current = must(b.preparations[0]);
    const entry = must(b.observations.find(o => o.observationHash === current.observationHash));
    const upgraded = structuredClone(entry); upgraded.observationHash = 'c'.repeat(64);
    const ref = current.proposal.target.kind === 'node' ? current.proposal.target.ref : undefined;
    if (ref === undefined) throw new Error('the fixture press follows a node fill');
    const fact = must(upgraded.observation.facts[ref]); expect(fact.role).toBe('textbox'); fact.role = 'combobox';
    b.observations.push(upgraded); current.observationHash = upgraded.observationHash;
    must(b.guardAuthorizations[0]).pressObservationHash = upgraded.observationHash; resealProofs(b);
    expect(() => { check(b); }).not.toThrow();
    fact.role = 'button'; resealProofs(b);
    expect(() => { check(b); }).toThrow();
  });
  it('globally refuses sparse duplicate classes and quoted pseudo refs', () => {
    const observation = { outline: '- button "Open [e9]" [e20] {ordinal=1/2}\n- button "Open [e9]" [e3] {ordinal=2/2}', facts: {
      e20: { role: 'button', name: 'Open [e9]', evidence: 'Open', editable: false, nameComplete: true, ownTextComplete: true, evidenceSegments: [], ordinal: { index: 1, count: 2 } },
      e3: { role: 'button', name: 'Open [e9]', evidence: 'Open', editable: false, nameComplete: true, ownTextComplete: true, evidenceSegments: [], ordinal: { index: 2, count: 2 } },
    } } as unknown as ValidationBasis['observations'][number]['observation'];
    expect(() => { validatePublicObservation(observation); }).not.toThrow();
    const sparse = structuredClone(observation) as TestDocument<typeof observation>;
    delete sparse.facts.e3; sparse.outline = sparse.outline.split('\n')[0] ?? '';
    expect(() => { validatePublicObservation(sparse as typeof observation); }).toThrow();
    expect(guardNormalize(' Ｏpen—Now! ')).toBe('open now');
  });
  it('scope hashes are independent public identity conjunctions', () => {
    const o = { outline: '- region "Primary" [e1]\n- button "Open" [e2]', facts: { e1: { role: 'region', name: 'Primary', evidence: 'Primary', editable: false, nameComplete: true, ownTextComplete: true, evidenceSegments: [] }, e2: { role: 'button', name: 'Open', evidence: 'Open', editable: false, nameComplete: true, ownTextComplete: true, evidenceSegments: [], scopeRefs: ['e1'] } } } as unknown as ValidationBasis['observations'][number]['observation'];
    const fact = must(o.facts.e2); expect(publicScopeHash(o, fact)).toBe(hashObserved([{ role: 'region', name: 'Primary' }]));
    expect(qualifiedScopeAllows(o, fact, 'Primary', 'click')).toBe(true); expect(qualifiedScopeAllows(o, fact, 'Secondary', 'click')).toBe(false);
  });
});

it('saved-only source eligibility preserves referenced nonmaterialized and global plain declarations', () => {
  const b = policyFixture(), previousStep = must(b.sourceSteps[0]).stepId;
  must(b.sourceSteps[0]).source = 'Fill the selected control';
  const declaration = { referenceId:'guard-source-only',kind:'plain' as const,valueHash:'c'.repeat(64) };
  b.snapshotEvidence.current.authoredDeclarations.push(declaration);
  const step = must(b.snapshotEvidence.current.authoring.steps.find(s => s.id === previousStep));
  step.context.entries.push({kind:'variableRef',referenceId:declaration.referenceId});
  const witness = must(b.guardAuthorizations[0]);
  witness.predecessorGrounding.source = {kind:'SAVED_INPUT',stepId:previousStep,declarationId:declaration.referenceId,declarationHash:hashObserved(declaration)};
  witness.sourceIdentityHash = hashObserved(b.snapshotEvidence.current);
  expect(b.materializationEvidence.entries.some(e => e.metadata.provenance.referenceKind === 'configuration' && e.metadata.provenance.referenceId === declaration.referenceId)).toBe(false);
  expect(() => { check(b); }).not.toThrow(); // Hidden lexical truth remains the backend source-authority boundary.
  step.context.entries = step.context.entries.filter(e => !(e.kind === 'variableRef' && e.referenceId === declaration.referenceId));
  witness.sourceIdentityHash = hashObserved(b.snapshotEvidence.current);
  expect(() => { check(b); }).toThrow();
  b.snapshotEvidence.current.authoring.globalContext.entries.push({kind:'default',name:'guard source',value:{kind:'variableRef',referenceId:declaration.referenceId}});
  witness.sourceIdentityHash = hashObserved(b.snapshotEvidence.current);
  expect(() => { check(b); }).not.toThrow();
});
