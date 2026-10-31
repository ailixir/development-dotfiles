/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-argument -- the documents are mutated by path to plant one fault each. */
/**
 * SC008-E6 AC7: the validators accept the frozen-step artifact the contract fixtures describe and refuse, one rule at a time, the faults
 * that matter for code that is stored and executed: a tampered step, a wrong operationHash preimage, a binding without a producer before
 * it, an origin outside the list, a missing secret, a publication witness that disagrees. Every refusal is paired with the repaired
 * document, which is accepted: the mutation is what flipped it.
 */
import { describe, expect, it } from 'vitest';

import type { Execute3, Scope } from '../../src/executor/observedOperations.js';
import { validateObservedExecute } from '../../src/executor/observedReplay.js';
import { assertResolvedSecretLiterals, deriveObservedArtifact, validateObservedJob, validateReplayArtifact } from '../../src/validator/observedReplay.js';
import { validatePublicObservation } from '../../src/validator/observedSnapshots.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
import { publicationFixture as fixture } from '../helpers/publicationFixture.js';

const clone = <T>(value: T): T => structuredClone(value);
const edit = <T>(value: T, change: (draft: any) => void): T => { const draft = clone(value); change(draft); return draft; };
const scope = fixture.job.binding.scope as unknown as Scope;
const execute = (message: unknown = fixture.execute, domains: readonly string[] = ['*']): Execute3 => validateObservedExecute(clone(message), scope, domains, fixture.launch as never);
const refusal = (run: () => unknown): string => { try { run(); } catch (error) { return (error as { code?: string }).code ?? (error as Error).message; } return 'ACCEPTED'; };
const job = (artifactMessage: unknown = fixture.job): unknown => validateObservedJob(clone(artifactMessage), fixture.build, ['*'], Date.parse(fixture.job.binding.replayGrant.issuedAt));

describe('the contract sample is accepted', () => {
  it('derives the published artifact from its basis, validates it, the job and the Execute frame', () => {
    expect(deriveObservedArtifact(fixture.basis).artifact).toEqual(fixture.artifact);
    expect(() => validateReplayArtifact(clone(fixture.artifact))).not.toThrow();
    expect(() => job()).not.toThrow();
    expect(() => execute()).not.toThrow();
    for (const row of fixture.basis.observations) expect(() => { validatePublicObservation(row.observation as never); }).not.toThrow();
  });
});

describe('the frozen step', () => {
  it('a step whose code changed while its sourceHash did not is refused in the Execute frame; changing both consistently is not a fault the frame can see', () => {
    const tampered = edit(fixture.execute, d => { d.steps[0].operations[0].operation.code += ' '; });
    expect(refusal(() => execute(tampered))).toBe('REFERENCE_MISMATCH');
    const rehashed = edit(tampered, d => { d.steps[0].operations[0].operation.sourceHash = hashObserved(d.steps[0].operations[0].operation.code); });
    expect(refusal(() => execute(rehashed))).toBe('ACCEPTED');
  });

  it('the same tamper in the published artifact is refused, and so is the hash chain around it', () => {
    const tampered = edit(fixture.artifact, d => { d.steps[0].operations[0].operation.code += ' '; });
    expect(refusal(() => validateReplayArtifact(tampered))).not.toBe('ACCEPTED');
    expect(refusal(() => validateReplayArtifact(clone(fixture.artifact)))).toBe('ACCEPTED');
  });

  it('a proposal whose code changed while its hash did not is refused by the basis', () => {
    const tampered = edit(fixture.basis, d => { d.preparations[0].proposal.operation.code += ' '; });
    expect(refusal(() => deriveObservedArtifact(tampered))).not.toBe('ACCEPTED');
  });

  it('operationHash is the hash of {coordinate, origin, operation} with no target key', () => {
    const action = fixture.artifact.learnedPlan.actions[1];
    if (!action) throw new Error('FIXTURE');
    const preimage = { coordinate: action.coordinate, origin: action.origin, operation: action.operation };
    expect(hashObserved(preimage)).toBe(action.operationHash);
    expect(hashObserved({ ...preimage, target: null })).not.toBe(action.operationHash);
    const wrong = edit(fixture.basis, d => { d.actions[1].ledger.operationHash = hashObserved({ ...preimage, target: null }); });
    expect(refusal(() => deriveObservedArtifact(wrong))).not.toBe('ACCEPTED');
  });
});

describe('bindings between steps', () => {
  it('a step that reads a binding nothing captured before it is refused', () => {
    const transfers = (fixture.execute.transfers as readonly { consumer: { stepId: string } }[]);
    const withoutEdge = edit(fixture.execute, d => { d.transfers = d.transfers.filter((t: { consumer: { stepId: string } }) => t.consumer.stepId !== transfers[0]?.consumer.stepId); });
    // Without an edge the binding is a retained-prefix binding, and that needs the proof frame this Execute does not carry.
    expect(refusal(() => execute(withoutEdge))).toBe('REFERENCE_MISMATCH');
    expect(refusal(() => execute())).toBe('ACCEPTED');
  });

  it('a transfer from a step that does not come before its consumer is refused', () => {
    const backwards = edit(fixture.execute, d => { for (const t of d.transfers) { const consumer = t.consumer; t.consumer = t.producer; t.producer = consumer; } });
    expect(refusal(() => execute(backwards))).toBe('REFERENCE_REFUSED');
  });

  it('a step that reads an input of another step, or one that does not exist, is refused', () => {
    const unknown = edit(fixture.execute, d => { d.steps[0].operations[0].operation.uses[0].id = 'no-such-input'; });
    expect(refusal(() => execute(unknown))).toBe('REFERENCE_REFUSED');
    const foreign = edit(fixture.execute, d => { d.steps[0].operations[0].operation.uses[0].id = 'input-label'; });
    expect(refusal(() => execute(foreign))).toBe('REFERENCE_REFUSED');
  });

  it('a step that declares a capture no binding names is refused', () => {
    const stray = edit(fixture.execute, d => { d.steps[0].operations[0].operation.captures = ['binding-reference']; });
    expect(refusal(() => execute(stray))).toBe('REFERENCE_REFUSED');
  });
});

describe('origins and secrets', () => {
  it('a guard origin outside the list is POLICY_REFUSED, and the same Execute frame passes under a list that holds it', () => {
    expect(refusal(() => execute(fixture.execute, ['elsewhere.example']))).toBe('POLICY_REFUSED');
    expect(refusal(() => execute(fixture.execute, ['orders.example.test']))).toBe('ACCEPTED');
  });

  it('a destination input with credentials is POLICY_REFUSED', () => {
    const credentials = edit(fixture.execute, d => { d.inputs[0].value = 'https://user:secret@orders.example.test/start'; });
    expect(refusal(() => execute(credentials))).toBe('POLICY_REFUSED');
  });

  it('the first step of a run that starts blank starts from the blank document', () => {
    const notBlank = edit(fixture.execute, d => { d.guards[0].origin = 'https://orders.example.test'; });
    expect(refusal(() => execute(notBlank))).not.toBe('ACCEPTED');
  });

  it('a step that reads a secret the run does not carry is refused, and one it carries is accepted', () => {
    const withSecret = (carried: boolean): unknown => edit(fixture.execute, d => {
      d.inputs.push({ inputId: 'input-secret', stepId: d.steps[0].stepId, kind: 'secretRef', referenceName: 'PASS' });
      d.steps[0].operations[0].operation.uses.push({ kind: 'secret', id: 'PASS' });
      d.steps[0].operations[0].operation.sourceHash = hashObserved(d.steps[0].operations[0].operation.code);
      if (carried) { d.secrets = { PASS: 'CANARY-SECRET' }; d.secretOrigins = { PASS: ['https://orders.example.test'] }; }
    });
    expect(refusal(() => execute(withSecret(false)))).toBe('REFERENCE_MISMATCH');
    expect(refusal(() => execute(withSecret(true)))).toBe('ACCEPTED');
  });

  it('an authored value equal to a resolved secret is refused', () => {
    const clash = edit(fixture.execute, d => {
      d.inputs.push({ inputId: 'input-secret', stepId: d.steps[0].stepId, kind: 'secretRef', referenceName: 'PASS' });
      d.secrets = { PASS: d.inputs[0].value };
    });
    expect(refusal(() => { assertResolvedSecretLiterals(clash as never); })).toBe('REFERENCE_MISMATCH');
    expect(refusal(() => { assertResolvedSecretLiterals(edit(clash, d => { d.secrets = { PASS: 'CANARY-SECRET' }; }) as never); })).toBe('ACCEPTED');
  });
});

describe('publication witnesses', () => {
  it('a job whose artifact policy names another publication evidence than its binding is refused', () => {
    const forged = edit(fixture.job, d => { d.binding.publicationEvidenceHash = 'f'.repeat(64); });
    expect(refusal(() => job(forged))).toBe('EVIDENCE_MISMATCH');
    expect(refusal(() => job())).toBe('ACCEPTED');
  });
});

describe('public observations', () => {
  it('keep their ordinal rule: two lines that read the same without an ordinal are refused', () => {
    const row = fixture.basis.observations[0];
    if (!row) throw new Error('FIXTURE');
    const twins = edit(row.observation, d => { d.facts.e2 = clone(d.facts.e1); d.outline = d.outline.replace('textbox "Destination" [e2]', 'text "Reference" [e2]'); });
    // The rule compares the missing ordinal with the expected one, and a missing value is not comparable: INVALID_CONTRACT, as it always was.
    expect(refusal(() => { validatePublicObservation(twins as never); })).toBe('INVALID_CONTRACT');
    const numbered = edit(twins, d => {
      d.facts.e1.ordinal = { index: 1, count: 2 }; d.facts.e2.ordinal = { index: 2, count: 2 };
      d.outline = d.outline.replace('text "Reference" [e1]', 'text "Reference" {ordinal=1/2} [e1]').replace('text "Reference" [e2]', 'text "Reference" {ordinal=2/2} [e2]');
    });
    expect(refusal(() => { validatePublicObservation(numbered as never); })).toBe('ACCEPTED');
  });

  it('the basis refuses a fact that still carries a field contract v3 dropped', () => {
    const stale = edit(fixture.basis, d => { const o = d.observations[0].observation; o.facts[String(Object.keys(o.facts)[0])].readScope = { relation: 'SAME_ROW_LABEL', sourceRefs: [] }; });
    expect(refusal(() => deriveObservedArtifact(stale))).not.toBe('ACCEPTED');
    const dropped = edit(fixture.basis, d => { const o = d.observations[0].observation; o.facts[String(Object.keys(o.facts)[0])].directTextAssertion = true; });
    expect(refusal(() => deriveObservedArtifact(dropped))).not.toBe('ACCEPTED');
  });
});
