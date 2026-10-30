import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthoringSnapshotIdentity, Configuration, LearnedPlan, ValidationBasis } from '../src/executor/observedOperations.js';
import { deriveObservedArtifact } from '../src/validator/observedReplay.js';
import { deriveSnapshotMaps, inputChains, stepSnapshots } from '../src/validator/observedSnapshots.js';
import { hashObserved, validateObserved } from '../src/validator/observedReferencePolicy.js';
import { parseDocumentJson } from './helpers/documentJson.js';

// The permanent reviewed fixture is the oracle. No QA evidence or production constructor is
// imported to manufacture an expected envelope. Projection-only inputs are deliberately kept
// outside publication admission; TypeScript exposes snapshots, not a learned-content hash API.
type J = null | boolean | number | string | J[] | { [key: string]: J };
type O = Record<string, J>;
function required<T>(value: T | undefined): T { if (value === undefined) throw Error('MISSING_FACT'); return value; }
function str(value: J): string { if (typeof value !== 'string') throw Error('EXPECTED_STRING'); return value; }
const doc = parseDocumentJson(readFileSync(new URL('../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json', import.meta.url)), 33554432) as J;
function obj(v: J): O { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('EXPECTED_OBJECT'); return v; }
function arr(v: J): J[] { if (!Array.isArray(v)) throw Error('EXPECTED_ARRAY'); return v; }
function at(v: J, path: string): J {
  for (const key of path.split('/').filter(Boolean)) { v = required(Array.isArray(v) ? v[Number(key)] : obj(v)[key]); }
  return v;
}
function put(v: J, path: string, value: J): void { const keys = path.split('/').filter(Boolean), key = required(keys.pop()); const parent = keys.length ? at(v, keys.join('/')) : v; if (Array.isArray(parent)) parent[Number(key)] = value; else obj(parent)[key] = value; }
function remove(v: J, path: string): void { const keys = path.split('/').filter(Boolean), key = required(keys.pop()); const parent = keys.length ? at(v, keys.join('/')) : v; if (Array.isArray(parent)) parent.splice(Number(key), 1); else Reflect.deleteProperty(obj(parent), key); }
const copy = <T>(v: T): T => structuredClone(v);
const positives = arr(at(doc, 'snapshotCorrection/positives'));
const ordinary = required(positives[0]);
const boundary = required(positives[1]);
const basePath = 'snapshotEvidence/baseProof';
const identityPath = `${basePath}/revision/identity`;
const artifactPath = `${basePath}/artifact`;
const normalization = at(doc, 'snapshotCorrection/normalization');
const identity = (v: J): AuthoringSnapshotIdentity => v as unknown as AuthoringSnapshotIdentity;
const config = (v: J): Configuration => v as unknown as Configuration;
const plan = (v: J): Pick<LearnedPlan, 'actions' | 'bindings'> => v as unknown as Pick<LearnedPlan, 'actions' | 'bindings'>;
const basis = (v: J): ValidationBasis => validateObserved<ValidationBasis>('replay-validation#/definitions/ValidationBasis', v);
const chains = (i: J, c: J): string[] => inputChains(identity(i), config(c));
function computation(row: J): J { return copy(at(row, 'snapshotComputation')); }
function normalizedComputation(): J {
  const expected = computation(ordinary), i = at(normalization, 'identity');
  put(expected, 'testConfig/globalContextHash', hashObserved(at(i, 'authoring/globalContext')));
  arr(at(i, 'authoring/steps')).forEach((step, n) => { put(expected, `rows/${String(n)}/stepInput/context`, copy(at(step, 'context'))); });
  return expected;
}
function construction(label: string, i: J, c: J, p: J, expected: J): Record<string, string> {
  const before = JSON.stringify([i, c, p]), actualChains = chains(i, c);
  const actual = stepSnapshots(identity(i), config(c), plan(p)), snapshots: Record<string, string> = {};
  let previous = hashObserved(at(expected, 'testConfig'));
  arr(at(expected, 'rows')).forEach((row, n) => {
    const input = at(row, 'stepInput'), id = str(at(input, 'stepId'));
    const chain = { domain: 'studio.step-chain', version: 1, stepId: id, stepInputHash: hashObserved(input), previous };
    expect(actualChains[n], `${label}: predecessor ${String(n)}`).toBe(hashObserved(chain));
    previous = hashObserved(chain);
    snapshots[id] = hashObserved({ domain: 'studio.step-snapshot', version: 1, stepId: id, inputChain: previous, learnedStepHash: hashObserved(at(row, 'learnedContent')) });
  });
  expect(actual, `${label}: exact composition`).toEqual(snapshots);
  expect(JSON.stringify([i, c, p]), `${label}: source-graph-preserved`).toBe(before);
  return actual;
}
const current = (): J => copy(at(ordinary, 'basis/snapshotEvidence/current'));
const configuration = (): J => copy(at(ordinary, 'basis/configuration'));
const learned = (): J => copy(at(ordinary, 'expectedArtifact/learnedPlan'));
const altered = 'b'.repeat(64);

// All five frozen source positions, including historical and drift1, exercise real constructors.
describe('57/five construction envelopes', () => {
  beforeEach(() => {
    construction('57/config/base;57/snapshot/source-graph-preserved', current(), configuration(), learned(), computation(ordinary));
    expect(deriveObservedArtifact(at(ordinary, 'basis')).artifact).toEqual(at(ordinary, 'expectedArtifact'));
  });
  for (const row of positives) it(`57/chain/all-golden-rows; 57/learned/all-golden-rows; 57/snapshot/golden-all-steps: ${str(at(row, 'name'))}`, () => {
    const expected = computation(row), i = at(row, 'basis/snapshotEvidence/current'), c = at(row, 'basis/configuration'), p = at(row, 'expectedArtifact/learnedPlan');
    const actual = construction('57/config/base', i, c, p, expected);
    let previous = hashObserved(at(expected, 'testConfig'));
    arr(at(expected, 'rows')).forEach((r, n) => {
      expect(at(r, 'stepChain/previous'), '57/chain/predecessor').toBe(previous);
      expect(at(r, 'stepChain/stepInputHash')).toBe(hashObserved(at(r, 'stepInput')));
      previous = hashObserved(at(r, 'stepChain'));
      expect(chains(i, c)[n]).toBe(previous);
      expect(actual[str(at(r, 'stepInput/stepId'))]).toBe(at(r, 'snapshotHash'));
    });
    const raw = at(row, 'basis');
    if (at(raw, 'snapshotEvidence/baseProof') !== null) {
      const base = at(raw, 'snapshotEvidence/baseProof'), historical = required(positives[3]);
      expect(at(base, 'authoringIdentity')).toEqual(at(historical, 'basis/snapshotEvidence/current'));
      const oldMaps = construction('57/snapshot/independent-base', at(base, 'authoringIdentity'), at(base, 'configuration'), at(base, 'artifact/learnedPlan'), computation(historical));
      expect(oldMaps).toEqual(at(base, 'revision/stepSnapshotHashes'));
    }
    const b = basis(raw);
    expect(deriveSnapshotMaps(b, plan(p)).stepSnapshotHashes).toEqual(actual);
    expect(deriveObservedArtifact(b).artifact).toEqual(at(row, 'expectedArtifact'));
  });

  for (const [label, path, value] of [
    ['environment', 'environment', 'other'], ['viewport-width', 'viewport/width', 1281], ['viewport-height', 'viewport/height', 721], ['timeout', 'timeoutSeconds', 11], ['wait', 'waitStrategy', 'networkidle'],
  ] as const) it(`57/config/${label}`, () => {
    const i = current(), c = configuration(), expected = computation(ordinary), old = chains(i, c);
    put(c, path, value); put(expected, `testConfig/${path}`, value);
    construction(`57/config/${label}`, i, c, learned(), expected);
    chains(i, c).forEach((h, n) => { expect(h).not.toBe(old[n]); });
  });

  it('57/config/browser-included; 57/chain/wrong-wrapper', () => {
    const expected = computation(ordinary), input = at(expected, 'rows/0/stepInput'), actual = chains(current(), configuration())[0];
    expect(at(expected, 'testConfig/browser')).toBe('chromium');
    const missing = copy(at(expected, 'testConfig')); remove(missing, 'browser');
    for (const previous of [hashObserved(missing), hashObserved({ config: at(expected, 'testConfig') }), at(expected, 'testConfig')]) {
      expect(actual).not.toBe(hashObserved({ domain: 'studio.step-chain', version: 1, stepId: at(input, 'stepId'), stepInputHash: hashObserved(input), previous }));
    }
    for (const r of arr(at(expected, 'rows'))) {
      expect(hashObserved([at(r, 'stepChain')])).not.toBe(hashObserved(at(r, 'stepChain')));
      expect(hashObserved({ chain: at(r, 'stepChain') })).not.toBe(hashObserved(at(r, 'stepChain')));
    }
    const tail = copy(at(expected, 'rows/2/stepChain')); put(tail, 'previous', hashObserved(at(expected, 'rows/0/stepChain')));
    expect(chains(current(), configuration())[2]).not.toBe(hashObserved(tail));
  });

  for (const [label, path, value, index] of [
    ['57/input/text', 'authoring/steps/1/text', 'Read  the reference\nCafé é 🧪\u0001', 1],
    ['57/input/context-literal', 'authoring/steps/2/context/entries/1/value', '  é Café\t\n\u0001  ', 2],
  ] as const) it(label, () => {
    const i = current(), expected = computation(ordinary), old = chains(i, configuration());
    put(i, path, value);
    put(expected, `rows/${String(index)}/stepInput/${path.endsWith('/text') ? 'text' : 'context/entries/1/value'}`, value);
    construction(label, i, configuration(), learned(), expected);
    chains(i, configuration()).forEach((h, n) => { if (n < index) expect(h).toBe(old[n]); else expect(h).not.toBe(old[n]); });
  });

  it('57/chain/mutate-j; 57/input/scoped-reference; 57/snapshot/source-graph-preserved', () => {
    const i = current(), expected = computation(ordinary), declaration = copy(at(i, 'authoredDeclarations/0'));
    put(declaration, 'valueHash', altered); put(i, 'authoredDeclarations/0', declaration); put(expected, 'rows/2/stepInput/references/0', copy(declaration));
    const old = chains(current(), configuration()); construction('57/input/scoped-reference', i, configuration(), learned(), expected);
    const actual = chains(i, configuration()); expect(actual.slice(0, 2)).toEqual(old.slice(0, 2)); expect(actual[2]).not.toBe(old[2]);
    expect(at(expected, 'testConfig/globalReferences')).toEqual([]);
  });

  for (const [label, scope] of [['57/config/global-literal', 'entries'], ['57/config/global-evidence', 'evidenceReferences']] as const) it(label, () => {
    const i = current(), expected = computation(ordinary), context = copy(at(i, 'authoring/globalContext'));
    put(context, scope, scope === 'entries' ? [{ kind: 'text', value: '  é Café\u0001\n🧪 ' }] : copy(at(normalization, 'identity/authoring/steps/1/context/evidenceReferences')));
    put(i, 'authoring/globalContext', context); put(expected, 'testConfig/globalContextHash', hashObserved(context));
    construction(label, i, configuration(), learned(), expected);
    chains(i, configuration()).forEach((h, n) => { expect(h).not.toBe(chains(current(), configuration())[n]); });
  });

  it('57/config/global-declaration; 57/normalize/unicode-order', () => {
    const i = current(), expected = computation(ordinary);
    const low = { referenceId: '\uE000', kind: 'plain', valueHash: hashObserved('') }, high = { referenceId: '\u{10000}', kind: 'plain', valueHash: hashObserved(' ') };
    const context = { entries: [{ kind: 'default', name: 'high-first', value: { kind: 'variableRef', referenceId: high.referenceId } }, { kind: 'default', name: 'one', value: { kind: 'variableRef', referenceId: low.referenceId } }, { kind: 'default', name: 'high-repeat', value: { kind: 'variableRef', referenceId: high.referenceId } }], evidenceReferences: [] };
    put(i, 'authoring/globalContext', context); put(i, 'authoredDeclarations', [at(i, 'authoredDeclarations/0'), low, high]);
    put(expected, 'testConfig/globalContextHash', hashObserved(context)); put(expected, 'testConfig/globalReferences', [low, high]);
    validateObserved('authoring-snapshot#/definitions/AuthoringSnapshotIdentity', i);
    construction('57/config/global-declaration', i, configuration(), learned(), expected);
    const changed = copy(i), changedExpected = copy(expected); put(changed, 'authoredDeclarations/1/valueHash', altered); put(changedExpected, 'testConfig/globalReferences/0/valueHash', altered);
    construction('57/config/global-declaration: changed value', changed, configuration(), learned(), changedExpected);
    chains(changed, configuration()).forEach((h, n) => { expect(h).not.toBe(chains(i, configuration())[n]); });
  });

  for (const exact of [null, false] as const) it(`57/input/targethint-${String(exact)}; 57/normalize/hint-${String(exact)}; 57/snapshot/normalized-metadata`, () => {
    const i = copy(at(normalization, 'identity')), expected = normalizedComputation();
    put(i, 'authoring/steps/1/context/entries/0/exact', exact); put(expected, 'rows/1/stepInput/context/entries/0/exact', exact);
    construction(`57/input/targethint-${String(exact)}`, i, at(normalization, 'configuration'), learned(), expected);
    expect(at(i, 'authoring/steps/1/context/evidenceReferences/0/capturedAt')).toBe('2026-10-15T04:00:00.123456789Z');
  });
  const evidenceMutations: readonly [string, J][] = [['id', '00000000-0000-4000-8000-000000000778'], ['revision', 2], ['csiId', 'CSI-456'], ['environment', 'other'], ['route', '/other'], ['state', 'other'], ['stepId', '00000000-0000-4000-8000-000000000003'], ['capturedAt', '2026-10-15T04:00:00.123456788Z'], ['completeness', 'complete'], ['hash', altered]];
  for (const [field, value] of evidenceMutations) it(`57/input/evidence-each-field/${field}; 57/normalize/fractional-iso`, () => {
    const i = copy(at(normalization, 'identity')), expected = normalizedComputation(), old = chains(i, configuration());
    put(i, `authoring/steps/1/context/evidenceReferences/0/${field}`, value); put(expected, `rows/1/stepInput/context/evidenceReferences/0/${field}`, value);
    construction(`57/input/evidence-each-field/${field}`, i, configuration(), learned(), expected);
    expect(chains(i, configuration())[0]).toBe(old[0]); expect(chains(i, configuration())[1]).not.toBe(old[1]);
  });
  it('57/input/evidence-each-field/source is a closed constant', () => {
    const i = copy(at(normalization, 'identity')); put(i, 'authoring/steps/1/context/evidenceReferences/0/source', 'observed');
    expect(() => validateObserved('authoring-snapshot#/definitions/AuthoringSnapshotIdentity', i)).toThrow('INVALID_CONTRACT');
  });

  for (const [label, path, value] of [
    ['57/normalize/absent-context', 'authoring/globalContext', undefined], ['57/normalize/null-context', 'authoring/steps/0/context', null], ['57/normalize/empty-arrays', 'authoring/steps/0/context/evidenceReferences', undefined],
  ] as const) it(`${label}: TS closed normalized boundary`, () => {
    const i = current(); if (value === undefined) remove(i, path); else put(i, path, value);
    expect(() => validateObserved('authoring-snapshot#/definitions/AuthoringSnapshotIdentity', i)).toThrow('INVALID_CONTRACT');
  });

  for (const [label, value] of [['57/value/empty', ''], ['57/value/whitespace', ' ']] as const) it(label, () => {
    const i = current(), expected = computation(ordinary), hash = hashObserved(value);
    if (value === '') expect(hash).toBe('12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126');
    expect(hash).not.toBe(hashObserved(null)); expect(hash).not.toBe(hashObserved(value === '' ? ' ' : ''));
    put(i, 'authoredDeclarations/0/valueHash', hash); put(expected, 'rows/2/stepInput/references/0/valueHash', hash);
    construction(label, i, configuration(), learned(), expected);
  });
  for (const [label, value] of [['57/value/missing', undefined], ['57/value/null', null]] as const) it(label, () => {
    const i = current(); if (value === undefined) remove(i, 'authoredDeclarations/0/valueHash'); else put(i, 'authoredDeclarations/0/valueHash', value);
    expect(() => validateObserved('authoring-snapshot#/definitions/AuthoringSnapshotIdentity', i)).toThrow('INVALID_CONTRACT');
  });
  for (const mutation of ['wrong-kind', 'duplicate', 'unused', 'direct-secret-collision']) it(`57/input/scoped-reference/${mutation}`, () => {
    const i = current(), declarations = arr(at(i, 'authoredDeclarations'));
    if (mutation === 'wrong-kind') { put(i, 'authoredDeclarations/0', { referenceId: 'saved-label', kind: 'secretRef', secretId: 'saved-label' }); }
    if (mutation === 'duplicate') declarations.push(copy(required(declarations[0])));
    if (mutation === 'unused') declarations.push({ referenceId: 'unused', kind: 'plain', valueHash: altered });
    if (mutation === 'direct-secret-collision') put(i, 'authoring/steps/0/text', '<secret saved-label>');
    expect(() => chains(i, configuration())).toThrow();
  });

  it('57/input/scoped-reference/token-context-default-union; unexecuted authored reference', () => {
    const i = current(), expected = computation(ordinary), secret = { referenceId: 'LOGIN_PASSWORD', kind: 'secretRef', secretId: 'LOGIN_PASSWORD' }, local = { referenceId: 'local-one', kind: 'plain', valueHash: hashObserved('') }, alias = { ...secret, referenceId: 'secret-alias' };
    const text = '<var local-one> <var local-one> <secret LOGIN_PASSWORD>', context = { entries: [{ kind: 'default', name: 'local', value: { kind: 'variableRef', referenceId: 'local-one' } }, { kind: 'secretRef', referenceId: 'secret-alias' }], evidenceReferences: [] };
    put(i, 'authoring/steps/0/text', text); put(i, 'authoring/steps/0/context', context); put(i, 'authoredDeclarations', [secret, local, at(i, 'authoredDeclarations/0'), alias]);
    put(expected, 'rows/0/stepInput/text', text); put(expected, 'rows/0/stepInput/context', context); put(expected, 'rows/0/stepInput/references', [secret, local, alias]);
    const p = learned(); put(p, 'actions', arr(at(p, 'actions')).slice(0, 2)); put(p, 'bindings/0/consumers', []);
    put(expected, 'rows/2/learnedContent/actions', []); put(expected, 'rows/2/learnedContent/consumedBindings', []);
    construction('57/input/scoped-reference/token-context-default-union', i, configuration(), p, expected);
  });
  it('57/normalize/context-evidence-array-order; exact stored strings', () => {
    const i = copy(at(normalization, 'identity')), expected = normalizedComputation();
    const context = at(i, 'authoring/steps/1/context'), second = copy(at(context, 'evidenceReferences/0'));
    put(second, 'id', '00000000-0000-4000-8000-000000000778');
    arr(at(context, 'entries')).push({ kind: 'text', value: '  Café é\t\u0001  ' }); arr(at(context, 'evidenceReferences')).push(second);
    put(expected, 'rows/1/stepInput/context', copy(context)); construction('57/normalize/context-evidence-array-order', i, configuration(), learned(), expected);
    const old = chains(i, configuration()); arr(at(context, 'entries')).reverse(); arr(at(context, 'evidenceReferences')).reverse(); put(expected, 'rows/1/stepInput/context', copy(context));
    construction('57/normalize/context-evidence-array-order: reversed', i, configuration(), learned(), expected); expect(chains(i, configuration())[1]).not.toBe(old[1]);
  });
  it('57/chain/predecessor/source-position-not-uuid-order', () => {
    const i = current(), expected = computation(ordinary), steps = arr(at(i, 'authoring/steps')), rows = arr(at(expected, 'rows'));
    [steps[0], steps[1]] = [required(steps[1]), required(steps[0])]; [rows[0], rows[1]] = [required(rows[1]), required(rows[0])];
    construction('57/chain/predecessor/source-position-not-uuid-order', i, configuration(), learned(), expected);
  });
  it('57/input/targethint-scope', () => {
    const i = copy(at(normalization, 'identity')), expected = normalizedComputation();
    put(i, 'authoring/steps/1/context/entries/0/scope', '  region é  '); put(expected, 'rows/1/stepInput/context/entries/0/scope', '  region é  ');
    construction('57/input/targethint-scope', i, configuration(), learned(), expected);
  });
  for (const [field, value] of evidenceMutations) it(`57/config/global-evidence/${field}`, () => {
    const i = current(), expected = computation(ordinary), evidence = copy(at(normalization, 'identity/authoring/steps/1/context/evidenceReferences'));
    put(evidence, `0/${field}`, value); put(i, 'authoring/globalContext/evidenceReferences', evidence); put(expected, 'testConfig/globalContextHash', hashObserved(at(i, 'authoring/globalContext')));
    construction(`57/config/global-evidence/${field}`, i, configuration(), learned(), expected);
  });
  it('57/learned/retained-semantic-fields/coordinates;57/learned/utf8-ties/argumentSlot', () => {
    for (const [source, target, value] of [
      ['actions/0/coordinate/ordinal', 'rows/0/learnedContent/actions/0/coordinate/ordinal', 3],
      ['bindings/0/producer/ordinal', 'rows/1/learnedContent/producedBindings/0/producer/ordinal', 1],
      ['bindings/0/consumers/0/coordinate/ordinal', 'rows/2/learnedContent/consumedBindings/0/coordinate/ordinal', 1],
    ] as const) { const p = learned(), expected = computation(ordinary); put(p, source, value); put(expected, target, value); construction('57/learned/retained-semantic-fields/coordinate', current(), configuration(), p, expected); }
    const p = learned(), expected = computation(ordinary), source = arr(at(p, 'bindings/0/consumers')), targets = arr(at(expected, 'rows/2/learnedContent/consumedBindings'));
    for (const [n, slot] of [[0, '\u{10000}'], [1, '\uE000']] as const) {
      put(required(source[n]), 'coordinate/ordinal', 0); put(required(source[n]), 'argumentSlot', slot);
      put(required(targets[n]), 'coordinate/ordinal', 0); put(required(targets[n]), 'argumentSlot', slot);
    }
    targets.reverse(); construction('57/learned/utf8-ties/argumentSlot', current(), configuration(), p, expected);
    // Step membership is semantic at this projection layer; moving an action changes both rows.
    const moved = learned(), exp = computation(ordinary), action = copy(at(exp, 'rows/0/learnedContent/actions/0'));
    const id = at(exp, 'rows/1/stepInput/stepId'); put(moved, 'actions/0/coordinate/stepId', id); put(action, 'coordinate/stepId', id);
    put(exp, 'rows/0/learnedContent/actions', []); arr(at(exp, 'rows/1/learnedContent/actions')).unshift(action);
    construction('57/learned/retained-semantic-fields/coordinate-stepId', current(), configuration(), moved, exp);
    const producerPlan = learned(), producerExpected = computation(ordinary), producer = copy(at(producerExpected, 'rows/1/learnedContent/producedBindings/0'));
    const lastId = at(producerExpected, 'rows/2/stepInput/stepId'); put(producerPlan, 'bindings/0/producer/stepId', lastId); put(producer, 'producer/stepId', lastId);
    put(producerExpected, 'rows/1/learnedContent/producedBindings', []); put(producerExpected, 'rows/2/learnedContent/producedBindings', [producer]);
    construction('57/learned/retained-semantic-fields/producer-stepId', current(), configuration(), producerPlan, producerExpected);
    const consumerPlan = learned(), consumerExpected = computation(ordinary), edge = copy(at(consumerExpected, 'rows/2/learnedContent/consumedBindings/0'));
    const firstId = at(consumerExpected, 'rows/0/stepInput/stepId'); put(consumerPlan, 'bindings/0/consumers/0/coordinate/stepId', firstId); put(edge, 'coordinate/stepId', firstId);
    put(consumerExpected, 'rows/0/learnedContent/consumedBindings', [edge]); arr(at(consumerExpected, 'rows/2/learnedContent/consumedBindings')).shift();
    construction('57/learned/retained-semantic-fields/consumer-stepId', current(), configuration(), consumerPlan, consumerExpected);

  });
  it('57/learned/unsorted-multiple; 57/learned/utf8-ties', () => {
    const p = learned(), expected = computation(ordinary), binding = copy(at(p, 'bindings/0'));
    const low = copy(binding), high = copy(binding); put(low, 'bindingId', '\uE000'); put(high, 'bindingId', '\u{10000}');
    for (const copiedBinding of [low, high]) for (const consumer of arr(at(copiedBinding, 'consumers'))) {
      put(consumer, 'bindingId', at(copiedBinding, 'bindingId'));
    }
    // Projection-only: producer/edge UTF8 ties deliberately use opaque identifiers, never tokens.
    put(p, 'bindings', [high, low]); arr(at(p, 'actions')).reverse();
    const producer = at(expected, 'rows/1/learnedContent/producedBindings/0');
    const lp = copy(producer), hp = copy(producer); put(lp, 'bindingId', '\uE000'); put(hp, 'bindingId', '\u{10000}');
    put(expected, 'rows/1/learnedContent/producedBindings', [lp, hp]);
    const edges = arr(at(expected, 'rows/2/learnedContent/consumedBindings'));
    const ordered: J[] = [];
    for (const edge of edges) { const le = copy(edge), he = copy(edge); put(le, 'bindingId', '\uE000'); put(he, 'bindingId', '\u{10000}'); ordered.push(le, he); }
    put(expected, 'rows/2/learnedContent/consumedBindings', ordered);
    construction('57/learned/utf8-ties', current(), configuration(), p, expected);
  });

  // Each scalar retained in the original semantic projection is mutated, including nested
  // recipes, locator, coordinate, provenance, transfer and authored sourceInputId fields.
  function leaves(v: J, prefix = ''): string[] { return v !== null && typeof v === 'object' ? Object.entries(v).flatMap(([k, child]) => leaves(child, `${prefix}/${k}`)) : [prefix]; }
  const projectedPairs: readonly [string, string][] = [
    ['actions/0', 'rows/0/learnedContent/actions/0'], ['actions/1', 'rows/1/learnedContent/actions/0'], ['actions/2', 'rows/2/learnedContent/actions/0'], ['actions/3', 'rows/2/learnedContent/actions/1'], ['actions/4', 'rows/2/learnedContent/actions/2'],
    ['bindings/0', 'rows/1/learnedContent/producedBindings/0'], ['bindings/0/consumers/0', 'rows/2/learnedContent/consumedBindings/0'], ['bindings/0/consumers/1', 'rows/2/learnedContent/consumedBindings/1'],
  ];
  for (const [source, target] of projectedPairs) for (const leaf of leaves(at(computation(ordinary), target))) {
    if (leaf.includes('/stepId') || leaf.includes('/ordinal')) continue; // Membership/sort coordinates tested separately below.
    it(`57/learned/retained-semantic-fields/${source}${leaf}`, () => {
      const p = learned(), expected = computation(ordinary), value = at(expected, target + leaf);
      const replacement: J = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : value === null ? 'changed' : `${str(value)} changed`;
      put(p, source + leaf, replacement); put(expected, target + leaf, replacement);
      construction('57/learned/retained-semantic-fields', current(), configuration(), p, expected);
      const index = Number(target.split('/')[1]); expect(hashObserved(at(expected, `rows/${String(index)}/learnedContent`))).not.toBe(hashObserved(at(computation(ordinary), `rows/${String(index)}/learnedContent`)));
    });
  }
  for (const path of ['actions/0/admissionId', 'bindings/0/provenance/sessionId', 'bindings/0/provenance/producerAdmissionId', 'bindings/0/consumers/0/producerAdmissionId', 'bindings/0/consumers/0/consumerAdmissionId', 'stepSnapshotHashes', 'reusedFrom', 'incremental']) it(`57/learned/removed-ids/${path}`, () => {
    const p = learned(); put(p, path, path.includes('/') ? 'different-evidence-id' : {});
    construction('57/learned/removed-ids', current(), configuration(), p, computation(ordinary));
  });
  it('57/learned/consumer-deletion', () => {
    const p = learned(), expected = computation(ordinary); put(p, 'bindings/0/consumers', []); put(expected, 'rows/2/learnedContent/consumedBindings', []);
    const actual = construction('57/learned/consumer-deletion', current(), configuration(), p, expected), old = stepSnapshots(identity(current()), config(configuration()), plan(learned()));
    const ids = arr(at(current(), 'authoring/steps')).map(s => str(at(s, 'id'))); expect(actual[required(ids[1])]).toBe(old[required(ids[1])]); expect(actual[required(ids[2])]).not.toBe(old[required(ids[2])]);
  });
});

// Reseal only enclosing commitments. The selected inner mismatch remains wrong. The closed
// shape must pass before the semantic verifier can receive each schema-valid counterexample.
function reseal(b: J, preserve = ''): void {
  const a = at(b, artifactPath), i = at(b, identityPath);
  if (preserve !== 'learnedPlanHash') { const h = hashObserved(at(a, 'learnedPlan')); put(a, 'learnedPlanHash', h); put(a, 'replayPolicy/learnedPlanHash', h); put(i, 'learnedPlanHash', h); }
  if (preserve !== 'referencePolicyHash') put(i, 'referencePolicyHash', hashObserved(at(a, 'replayPolicy')));
  if (preserve !== 'artifactHash') put(i, 'artifactHash', hashObserved(a));
  const digest = hashObserved(i); put(b, `${basePath}/revision/revisionDigest`, digest); put(b, 'snapshotEvidence/pinnedBase/revisionDigest', digest); put(b, 'incrementalEvidence/program/baseRevisionDigest', digest);
  put(b, 'incrementalEvidence/plan/prefixProgramHash', hashObserved(at(b, 'incrementalEvidence/program')));
}
function reject(label: string, b: J, shape = false): void {
  const original = JSON.stringify(b);
  if (shape) expect(() => basis(b), `${label}: shape`).toThrow('INVALID_CONTRACT');
  else {
    const checked = basis(b);
    expect(() => deriveSnapshotMaps(checked, plan(at(boundary, 'expectedArtifact/learnedPlan'))), label).toThrow('EVIDENCE_MISMATCH');
    expect(() => deriveObservedArtifact(b), `${label}: full builder`).toThrow();
  }
  expect(JSON.stringify(b), `${label}: raw preserved`).toBe(original);
}
const fresh = (): J => copy(at(boundary, 'basis'));
function equivalence(a: J): J { return { operations: arr(at(a, 'steps')).flatMap(s => arr(at(s, 'operations'))), guards: at(a, 'guards'), inputRecipes: at(a, 'inputRecipes'), bindings: at(a, 'replayPolicy/bindings'), transfers: at(a, 'replayPolicy/transfers') }; }
function preimages(b: J): Record<string, J> {
  const base = at(b, basePath), a = at(base, 'artifact'), steps = arr(at(base, 'authoringIdentity/authoring/steps'));
  return { sourceHash: steps.map(s => at(s, 'text')), authoringHash: steps.map((s, ordinal) => ({ stepId: at(s, 'id'), ordinal, source: at(s, 'text') })), configurationHash: at(base, 'configuration'), artifactHash: a, learnedPlanHash: at(a, 'learnedPlan'), referencePolicyHash: at(a, 'replayPolicy'), profileHash: at(a, 'profile'), operationEquivalenceHash: equivalence(a) };
}
const commitments = [['source', 'sourceHash'], ['authoring', 'authoringHash'], ['config', 'configurationHash'], ['artifact', 'artifactHash'], ['plan', 'learnedPlanHash'], ['policy', 'referencePolicyHash'], ['profile', 'profileHash'], ['equivalence', 'operationEquivalenceHash']] as const;
describe('65/exact immediate-base preimages', () => {
  beforeEach(() => {
    const control = fresh(), original = JSON.stringify(control);
    expect(deriveObservedArtifact(control).artifact).toEqual(at(boundary, 'expectedArtifact'));
    expect(deriveSnapshotMaps(basis(control), plan(at(boundary, 'expectedArtifact/learnedPlan'))).stepSnapshotHashes).toEqual(at(boundary, 'expectedArtifact/learnedPlan/stepSnapshotHashes'));
    expect(JSON.stringify(control)).toBe(original);
  });
  it('65/identity/exact16; 65/profile/full; coherent complete parent', () => {
    const b = fresh(), original = JSON.stringify(b), expected = preimages(b);
    for (const [key, value] of Object.entries(expected)) expect(hashObserved(value), key).toBe(at(b, `${identityPath}/${key}`));
    expect(Object.keys(obj(at(b, identityPath)))).toHaveLength(16); expect(at(b, `${artifactPath}/profile`)).toEqual({ contract: 3 });
    expect(hashObserved(at(b, identityPath))).toBe(at(b, 'snapshotEvidence/pinnedBase/revisionDigest'));
    expect(hashObserved(at(b, 'incrementalEvidence/program'))).toBe(at(b, 'incrementalEvidence/plan/prefixProgramHash'));
    expect(deriveObservedArtifact(b).artifact).toEqual(at(boundary, 'expectedArtifact'));
    expect(deriveSnapshotMaps(basis(b), plan(at(boundary, 'expectedArtifact/learnedPlan'))).stepSnapshotHashes).toEqual(at(boundary, 'expectedArtifact/learnedPlan/stepSnapshotHashes'));
    expect(JSON.stringify(b)).toBe(original);
  });
  for (const [label, key] of commitments) it(`65/${label}/${key === 'profileHash' ? 'wrapper-claim' : 'wrapper'}`, () => {
    const b = fresh(); put(b, `${identityPath}/${key}`, hashObserved({ value: required(preimages(b)[key]) })); reseal(b, key); reject(`65/${label}/wrapper`, b);
  });
  for (const [label, key] of commitments) it(`65/${label}/${key === 'sourceHash' || key === 'authoringHash' ? 'array' : 'full'}`, () => {
    expect(hashObserved(required(preimages(fresh())[key]))).toBe(at(fresh(), `${identityPath}/${key}`));
  });
  for (const [label, key] of [['source', 'sourceHash'], ['authoring', 'authoringHash']] as const) {
    for (const variant of ['reorder', ...(key === 'sourceHash' ? ['omit-line'] : ['omit-stepId', 'omit-ordinal', 'omit-source'])]) it(`65/${label}/${variant}`, () => {
      const b = fresh(), preimage = copy(required(preimages(b)[key]));
      if (variant === 'reorder') arr(preimage).reverse(); else if (variant === 'omit-line') arr(preimage).pop(); else remove(preimage, `0/${variant.slice(5)}`);
      put(b, `${identityPath}/${key}`, hashObserved(preimage)); reseal(b, key); reject(`65/${label}/${variant}`, b);
    });
  }
  it('65/source/current-draft', () => {
    // Current and old fixture text arrays coincide. A current draft with an intentional changed
    // line is a different claim; do not falsely assert the unchanged arrays have different hashes.
    const b = fresh(); put(b, 'snapshotEvidence/current/authoring/steps/2/text', 'A changed current draft'); put(b, 'sourceSteps/2/source', 'A changed current draft');
    const text = arr(at(b, 'snapshotEvidence/current/authoring/steps')).map(s => at(s, 'text'));
    put(b, 'sourceHash', hashObserved(text)); put(b, 'authoringHash', hashObserved(at(b, 'sourceSteps')));
    put(b, `${identityPath}/sourceHash`, hashObserved(text)); reseal(b, 'sourceHash'); reject('65/source/current-draft', b);
  });
  for (const key of ['operations', 'guards', 'inputRecipes', 'bindings', 'transfers']) it(`65/equivalence/omit-${key}`, () => {
    const b = fresh(), preimage = copy(required(preimages(b).operationEquivalenceHash)); remove(preimage, key); put(b, `${identityPath}/operationEquivalenceHash`, hashObserved(preimage)); reseal(b); reject(`65/equivalence/omit-${key}`, b);
  });
  it('65/equivalence/order', () => { const b = fresh(), e = copy(required(preimages(b).operationEquivalenceHash)); arr(at(e, 'operations')).reverse(); put(b, `${identityPath}/operationEquivalenceHash`, hashObserved(e)); reseal(b); reject('65/equivalence/order', b); });
  for (const [label, key, value] of [['environment', 'environment', 'other'], ['width', 'viewport/width', 1281], ['height', 'viewport/height', 721], ['timeout', 'timeoutSeconds', 11], ['wait', 'waitStrategy', 'networkidle']] as const) it(`65/config/legal-field-change/${label}`, () => { const b = fresh(); put(b, `${basePath}/configuration/${key}`, value); reseal(b); reject(`65/config/legal-field-change/${label}`, b); });

  const omissionGroups = [
    ['65/config/each-required-omission', `${basePath}/configuration`, ['browser', 'viewport', 'timeoutSeconds', 'waitStrategy', 'environment']],
    ['65/artifact/required-omission', artifactPath, ['version', 'kind', 'profile', 'sourceHash', 'configurationHash', 'authoringHash', 'learnedPlan', 'learnedPlanHash', 'guards', 'inputRecipes', 'steps', 'replayPolicy']],
    ['65/plan/required-omission', `${artifactPath}/learnedPlan`, Object.keys(obj(at(fresh(), `${artifactPath}/learnedPlan`)))],
    ['65/policy/required-omission', `${artifactPath}/replayPolicy`, Object.keys(obj(at(fresh(), `${artifactPath}/replayPolicy`)))],
    ['65/program/required-omission', 'incrementalEvidence/program', ['schemaVersion', 'baseRevisionId', 'baseRevisionDigest', 'sourceStepIds', 'actions']],
    ['65/identity/omit', identityPath, Object.keys(obj(at(fresh(), identityPath)))],
    ['65/profile/omission', `${artifactPath}/profile`, ['contract']],
    ['65/config/each-required-omission/viewport', `${basePath}/configuration/viewport`, ['width', 'height']],
    ['65/source/required-omission', `${basePath}/authoringIdentity/authoring/steps/0`, ['id', 'text', 'context']],
  ] as const;
  for (const [label, path, keys] of omissionGroups) for (const key of keys) it(`${label}${label.endsWith('omit') ? '-' : '/'}${key}`, () => { const b = fresh(); remove(b, `${path}/${key}`); reject(label, b, true); });
  it('65/profile/unsupported-constant', () => { const b = fresh(); put(b, `${artifactPath}/profile/contract`, 2); reject('65/profile/unsupported-constant', b, true); });
  it('65/identity/unknown-field', () => { const b = fresh(); put(b, `${identityPath}/extra`, true); reject('65/identity/unknown-field', b, true); });
  for (const kind of ['wrapper', 'whole-revision']) it(`65/identity/${kind}`, () => {
    const b = fresh(), value = kind === 'wrapper' ? { identity: at(b, identityPath) } : at(b, `${basePath}/revision`), digest = hashObserved(value);
    put(b, `${basePath}/revision/revisionDigest`, digest); put(b, 'snapshotEvidence/pinnedBase/revisionDigest', digest); put(b, 'incrementalEvidence/program/baseRevisionDigest', digest); put(b, 'incrementalEvidence/plan/prefixProgramHash', hashObserved(at(b, 'incrementalEvidence/program'))); reject(`65/identity/${kind}`, b);
  });
  for (const [label, path, value, preserve] of [
    ['65/artifact/valid-inner-change', `${artifactPath}/learnedPlan/planId`, 'different-plan', 'artifactHash'],
    ['65/plan/semantic-change', `${artifactPath}/learnedPlan/actions/0/operation/destinationInputId`, 'input-other', 'learnedPlanHash'],
    ['65/policy/semantic-change', `${artifactPath}/replayPolicy/bindings/0/sourceOrigin`, 'https://other.example.test', 'referencePolicyHash'],
    ['65/plan/duplicate-field-mismatch', `${artifactPath}/learnedPlanHash`, altered, 'learnedPlanHash'],
  ] as const) it(label, () => { const b = fresh(); put(b, path, value); reseal(b, preserve); reject(label, b); });
  for (const [label, key, preimage] of [['65/artifact/subset', 'artifactHash', 'learnedPlan'], ['65/policy/subset', 'referencePolicyHash', 'bindings']] as const) it(label, () => { const b = fresh(), a = at(b, artifactPath); put(b, `${identityPath}/${key}`, hashObserved(at(a, preimage === 'bindings' ? 'replayPolicy/bindings' : preimage))); reseal(b, key); reject(label, b); });
  for (const path of [`${basePath}/revision/id`, 'snapshotEvidence/pinnedBase/revisionId', 'incrementalEvidence/plan/baseRevisionId', 'incrementalEvidence/program/baseRevisionId', 'incrementalEvidence/switch/baseRevisionId']) it(`65/pin/each-id-copy/${path}`, () => { const b = fresh(); put(b, path, '00000000-0000-4000-8000-000000000902'); if (path.includes('/program/')) put(b, 'incrementalEvidence/plan/prefixProgramHash', hashObserved(at(b, 'incrementalEvidence/program'))); reject('65/pin/each-id-copy', b); });
  for (const path of [`${basePath}/revision/revisionDigest`, 'snapshotEvidence/pinnedBase/revisionDigest', 'incrementalEvidence/program/baseRevisionDigest']) it(`65/pin/each-digest-copy/${path}`, () => { const b = fresh(); put(b, path, altered); if (path.includes('/program/')) put(b, 'incrementalEvidence/plan/prefixProgramHash', hashObserved(at(b, 'incrementalEvidence/program'))); reject('65/pin/each-digest-copy', b); });
  it('65/program/wrapper', () => { const b = fresh(); put(b, 'incrementalEvidence/plan/prefixProgramHash', hashObserved({ program: at(b, 'incrementalEvidence/program') })); reject('65/program/wrapper', b); });
  for (const [label, path, value] of [['guard', 'actions/1/guard/target/readRuleId', 'other-rule'], ['action', 'actions/0/operation/destinationInputId', 'other-input']] as const) it(`65/program/${label}-resealed`, () => { const b = fresh(); put(b, `incrementalEvidence/program/${path}`, value); put(b, 'incrementalEvidence/plan/prefixProgramHash', hashObserved(at(b, 'incrementalEvidence/program'))); reject(`65/program/${label}-resealed`, b); });
  for (const [label, field] of [['admission', 'admissionProvenanceHash'], ['publication', 'publicationEvidenceHash'], ['authorization', 'runAuthorizationHash']] as const) it(`65/receipt/${label}-one-sided`, () => { const b = fresh(); put(b, `${artifactPath}/replayPolicy/${field}`, altered); reseal(b); reject(`65/receipt/${label}-one-sided`, b); });
  for (const [label, variant] of [['65/maps/missing-key', 'missing'], ['65/maps/extra-key', 'extra'], ['65/maps/reuse-copy-mismatch', 'reuse']] as const) it(label, () => {
    const b = fresh(), id = '00000000-0000-4000-8000-000000000001';
    if (variant === 'reuse') put(b, `${basePath}/revision/reusedFrom/${id}`, { revisionId: '00000000-0000-4000-8000-000000000902', stepId: id });
    else for (const path of [`${basePath}/revision/stepSnapshotHashes`, `${artifactPath}/learnedPlan/stepSnapshotHashes`]) {
      if (variant === 'missing') remove(b, `${path}/${id}`); else put(b, `${path}/00000000-0000-4000-8000-000000000999`, altered);
    }
    reseal(b); reject(label, b);
  });
  for (const name of ['base-operation-equivalence-is-recomputed', 'base-claimed-map-resealed-still-not-source-derived']) it(`65/maps/resealed-claimed-map; ${name}`, () => {
    const row = arr(at(doc, 'snapshotCorrection/negatives')).find(r => at(r, 'name') === name); expect(row).toBeDefined(); reject(name, at(required(row), 'basis'));
  });
  // 65/receipt/actual-stored-authority is deliberately not a pure test claim. The required real
  // PostgreSQL/HTTP companions are ObservedRevisionVerifier.verify(UUID) and immutable
  // GuidedPublicationEvidenceRepository joins (31/52/54/60/61/63). No hidden receipt is invented.
});
