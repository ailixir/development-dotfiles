import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import inspector from 'node:inspector';
import Module, { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';

/**
 * AC6 (ADR-SC-007 D3, WI-2): golden gate verdict vectors for the Java ports of the gates (WI-3).
 *
 * Step 0, before any recorded verdict is compared with a gate function: the classification rule, and its unit tests below. The
 * rule's sha256 is pinned here, so an EXACT row whose verdict differs from the recording is a finding to report and the rule
 * cannot be edited to make it go away.
 */

const VECTORS_DIR = join(packageRoot, 'test', 'fixtures', 'gate-vectors');
const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

interface Features {
  hasTail: boolean; targetIsNode: boolean; role: string | null; operationKind: string | null; predicate: string | null; truncatedQuote: boolean;
}
interface Classification {
  class: 'EXACT' | 'PARTIAL';
  partial: { gate: string; transform: string; lacks: string }[];
  applies: { intent: boolean; operation: boolean; g2: boolean };
}
// require() of an ES module (no top-level await) is synchronous on the Node this package requires (24), and needs no dynamic import().
const classification = createRequire(import.meta.url)('../fixtures/gate-vectors/classification.mjs') as {
  classifyRow(features: Features): Classification;
  LOSSY_TRANSFORMS: Record<string, string>;
  TAIL_LINE: RegExp;
};

/** The sha256 of classification.mjs, pinned before the vectors were evaluated. */
const PINNED_CLASSIFICATION_SHA256 = '7e42ce9b2ccfe37b7c532589ceb274de549ee3b8276893fff7010d9a158656e2';

describe('the classification rule (step 0)', () => {
  const base: Features = { hasTail: false, targetIsNode: true, role: 'button', operationKind: 'click', predicate: null, truncatedQuote: false };
  const classify = (override: Partial<Features>): Classification => classification.classifyRow({ ...base, ...override });

  it('is pinned: editing it to change a row\'s class changes this digest', () => {
    expect(sha256(readFileSync(join(VECTORS_DIR, 'classification.mjs')))).toBe(PINNED_CLASSIFICATION_SHA256);
  });

  it('enumerates the lossy transforms up front', () => {
    expect(Object.keys(classification.LOSSY_TRANSFORMS)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    const source = readFileSync(join(VECTORS_DIR, 'classification.mjs'), 'utf8');
    for (const id of Object.keys(classification.LOSSY_TRANSFORMS)) expect(source).toContain(`//   ${id} `);
  });

  it('a plain click on a button is EXACT', () => {
    expect(classify({})).toMatchObject({ class: 'EXACT', partial: [], applies: { intent: true, operation: true, g2: false } });
  });

  it('L1: a projected outline (tail line) makes the intent gate PARTIAL, and the G2 gate of an assert', () => {
    expect(classify({ hasTail: true }).partial).toEqual([{ gate: 'intent', transform: 'L1', lacks: expect.stringContaining('projection') as string }]);
    const assert = classify({ hasTail: true, operationKind: 'assert', predicate: 'containsText', role: 'heading' });
    expect(assert.partial.map((entry) => `${entry.gate}:${entry.transform}`)).toEqual(['intent:L1', 'g2:L1']);
  });

  it.each(['cell', 'gridcell', 'columnheader', 'rowheader'])('L2: a %s lacks its header names', (role) => {
    expect(classify({ role }).partial.map((entry) => `${entry.gate}:${entry.transform}`)).toEqual(['intent:L2']);
  });

  it('L3: a quote of 160 characters ending in the ellipsis makes the intent gate and G2 PARTIAL', () => {
    expect(classify({ truncatedQuote: true }).partial.map((entry) => `${entry.gate}:${entry.transform}`)).toEqual(['intent:L3']);
    expect(classify({ truncatedQuote: true, operationKind: 'assert', predicate: 'containsText' }).partial.map((entry) => `${entry.gate}:${entry.transform}`)).toEqual(['intent:L3', 'g2:L3']);
  });

  it('L4: fill on a combobox needs the DOM tag; select, click and other roles do not', () => {
    expect(classify({ role: 'combobox', operationKind: 'fill' }).partial.map((entry) => `${entry.gate}:${entry.transform}`)).toEqual(['operation:L4']);
    expect(classify({ role: 'combobox', operationKind: 'selectOption' }).class).toBe('EXACT');
    expect(classify({ role: 'textbox', operationKind: 'fill' }).class).toBe('EXACT');
  });

  it('G2 applies only to containsText asserts; the other predicates and operations have no G2 inputs to lack', () => {
    expect(classify({ operationKind: 'assert', predicate: 'visible', hasTail: false }).applies.g2).toBe(false);
    expect(classify({ operationKind: 'assert', predicate: 'containsText' }).applies.g2).toBe(true);
    expect(classify({ operationKind: 'click', predicate: 'containsText' }).applies.g2).toBe(false);
  });

  it('a reply without a node target has no intent, operation or G2 gate (the action gate is always EXACT)', () => {
    expect(classify({ targetIsNode: false, role: null, hasTail: true })).toMatchObject({ class: 'EXACT', partial: [], applies: { intent: false, operation: false, g2: false } });
  });

  it('a row with several lacking inputs lists each, and is PARTIAL', () => {
    const result = classify({ role: 'cell', hasTail: true, truncatedQuote: true, operationKind: 'assert', predicate: 'containsText' });
    expect(result.class).toBe('PARTIAL');
    expect(result.partial.map((entry) => `${entry.gate}:${entry.transform}`)).toEqual(['intent:L1', 'intent:L2', 'intent:L3', 'g2:L1', 'g2:L3']);
  });

  it('recognises the projection tail line only as a whole line', () => {
    expect(classification.TAIL_LINE.test('- button "x"\n… 12 more nodes not shown')).toBe(true);
    expect(classification.TAIL_LINE.test('  - text "… 12 more nodes not shown here"')).toBe(false);
    expect(classification.TAIL_LINE.test('      … 4 more options')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Step 1: the vectors, evaluated by the committed VERBATIM copy of the spike gate functions. Mechanical coverage: V8 precise
// coverage of the copy while every vector is evaluated. The untracked spike directory is never imported.

interface PureGates {
  intentGate(targetIntent: unknown, node: unknown): string | null;
  operationTargetGate(kind: unknown, node: unknown): string | null;
  actionGate(input: unknown): string[];
  evidenceFor(node: unknown): string;
  norm(value: string): string;
  words(value: string): string[];
  bound(value: string, limit?: number): string;
  parseOutline(outline: string): { byRef: Map<string, unknown> };
  g2(parsed: unknown, target: unknown, literal: string): { applies: boolean; reason?: string; refuse?: boolean; refuseCI?: boolean };
}
const COPY_PATH = join(VECTORS_DIR, '..', 'spike-pure', 'spike-pure.cjs');

interface RecordedRow {
  key: string; run: string; class: 'EXACT' | 'PARTIAL'; partial: { gate: string; transform: string; lacks: string }[]; features: Features; category: string;
  intent?: { targetIntent: string | null; node: Record<string, unknown>; facts: { name: string; evidence: string }; recorded: string | null; spike: string | null };
  operation?: { kind: string | null; node: Record<string, unknown>; recorded: string | null; spike: string | null };
  action: null | { planId: string; reply: unknown; obligation: unknown; inputs: unknown[]; recorded: string[]; spike: string[] };
  g2?: { literal: string; role: string; facts: { text: string | null }; truncated: boolean; spike: { applies: boolean; reason: string | null; refuse: boolean | null; refuseCI: boolean | null } };
}
interface RecordedFile {
  schemaVersion: number;
  provenance: { runs: string[]; sourceFileSha256: Record<string, string>; classificationSha256: string; spikeCopySha256: string; rowsExtracted: number; unlinkedRows: number };
  plans: Record<string, unknown>;
  rows: RecordedRow[];
  unlinked: string[];
}
interface SyntheticFile {
  intent: { id: string; branch: string; targetIntent: unknown; node: Record<string, unknown> | null; facts: { name: string; evidence: string }; expected: string | null; expectedSpike?: string | null }[];
  operation: { id: string; branch: string; kind: string | undefined; node: Record<string, unknown> | null; expected: string | null }[];
  g2: { id: string; branch: string; predicate: string; role: string; text: string; literal: string; withheld?: boolean; descendant?: string; expected: 'refuse' | 'pass' | 'notApplicable'; spikeDiffers?: string }[];
  g2Outline: { id: string; branch: string; outline: string; ref: string; literal: string; expected: { applies: boolean; reason?: string; refuse?: boolean; refuseCI?: boolean; truncated?: boolean } }[];
  action: { id: string; branch: string; reply: unknown; obligation: unknown; plan: unknown; inputs: unknown[]; expected: string[] }[];
}

const recorded = JSON.parse(readFileSync(join(VECTORS_DIR, 's3-gate-vectors.json'), 'utf8')) as RecordedFile;
const synthetic = JSON.parse(readFileSync(join(VECTORS_DIR, 'synthetic-gate-vectors.json'), 'utf8')) as SyntheticFile;

/** The G2 gate over facts (ADR-SC-007 D3): the n/a rules, then the spike's G2 comparison plus NFKC. */
const NO_TEXT_ROLES = new Set(['combobox', 'textbox', 'searchbox', 'spinbutton', 'slider', 'listbox']);
const collapseText = (value: string): string => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
function g2OverFacts(literal: string, input: { predicate: string; role: string; text: string | null; descendantHidden?: boolean }): 'refuse' | 'pass' | 'notApplicable' {
  if (input.predicate !== 'containsText' || NO_TEXT_ROLES.has(input.role) || input.text === null || input.descendantHidden === true) return 'notApplicable';
  if (Array.from(input.text).length >= 256 && input.text.endsWith('…')) return 'notApplicable';
  return collapseText(input.text).includes(collapseText(literal)) ? 'pass' : 'refuse';
}
/** The intent gate over facts: the spike's comparison on `name` and `evidence` (what the Java port sees). */
function intentOverFacts(pure: PureGates, targetIntent: unknown, facts: { name: string; evidence: string }): string | null {
  if (typeof targetIntent !== 'string' || pure.norm(targetIntent) === '') return 'INTENT_MISSING';
  if (pure.norm(targetIntent) === pure.norm(facts.name)) return null;
  const intentWords = pure.words(targetIntent);
  if (intentWords.length === 0) return 'INTENT_MISMATCH';
  const evidenceWords = new Set(pure.words(facts.evidence));
  return intentWords.every((word) => evidenceWords.has(word)) ? null : 'INTENT_MISMATCH';
}
const outlineForG2 = (row: SyntheticFile['g2'][number]): string => {
  const lines = [`- ${row.role} ${row.withheld === true ? '' : `${JSON.stringify(row.text)} `}[e1]${row.withheld === true ? ' {value withheld}' : ''}`];
  const below: Record<string, string> = { withheld: '  - generic [e2] {value withheld}', password: '  - passwordControl', sensitive: '  - withheld {sensitive}', unsupported: '  - canvas {unsupported surface}' };
  if (row.descendant !== undefined) lines.push(below[row.descendant] ?? '');
  return lines.join('\n');
};
const wantIntentInput = (value: unknown): unknown => (typeof value === 'object' && value !== null && 'omitted' in value ? undefined : value);

describe('the recorded S3 runs: provenance and classification', () => {
  it('records where the vectors come from, and the digests of the rule and of the gate copy', () => {
    expect(recorded.schemaVersion).toBe(1);
    expect(recorded.provenance.runs).toEqual(['s3v2-20261027', 'wave2-20261027']);
    expect(recorded.provenance.classificationSha256).toBe(PINNED_CLASSIFICATION_SHA256);
    expect(recorded.provenance.spikeCopySha256).toBe(sha256(readFileSync(COPY_PATH)));
    expect(Object.keys(recorded.provenance.sourceFileSha256)).toHaveLength(6);
    for (const digest of Object.values(recorded.provenance.sourceFileSha256)) expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(recorded.unlinked).toEqual([]);
    expect(recorded.provenance.unlinkedRows).toBe(0);
    expect(recorded.rows).toHaveLength(recorded.provenance.rowsExtracted);
    expect(recorded.rows.filter((row) => row.run === 's3v2-20261027')).toHaveLength(407);
    expect(recorded.rows.filter((row) => row.run === 'wave2-20261027')).toHaveLength(122);
  });

  it('every row\'s class re-derives from its features by the pinned rule', () => {
    for (const row of recorded.rows) {
      const derived = classification.classifyRow(row.features);
      expect({ class: row.class, partial: row.partial }, row.key).toEqual({ class: derived.class, partial: derived.partial });
    }
  });

  it('lists every PARTIAL row with the input it lacks, in the committed report', () => {
    const report = readFileSync(join(VECTORS_DIR, 'PARTIAL-ROWS.md'), 'utf8');
    const partialRows = recorded.rows.filter((row) => row.class === 'PARTIAL');
    expect(partialRows.length).toBeGreaterThan(0);
    for (const row of partialRows) {
      expect(row.partial.length, row.key).toBeGreaterThan(0);
      for (const entry of row.partial) {
        expect(entry.lacks.length).toBeGreaterThan(10);
        expect(report, row.key).toContain(`${row.key.replaceAll('|', '\\|')} | `);
        expect(report).toContain(`${entry.gate}: ${entry.transform} ${entry.lacks}`);
      }
    }
    expect(recorded.rows.filter((row) => row.class === 'EXACT').length + partialRows.length).toBe(recorded.rows.length);
    expect(report).toContain(`| s3v2-20261027 | 407 | ${String(recorded.rows.filter((row) => row.run === 's3v2-20261027' && row.class === 'EXACT').length)} |`);
  });
});

/**
 * Compiles the committed gate copy as a NEW script. V8 hands back an already compiled instance of identical source from its
 * compilation cache, and such an instance has lost its block-coverage data once it has run; a unique trailing comment makes the
 * source new. The text before the comment is byte-identical to the committed file.
 */
let compileCounter = 0;
let compiledMarker = '';
function compileFresh(): unknown {
  compiledMarker = `coverageRunMarker${String(++compileCounter)}x${String(Date.now())}`;
  const source = `${readFileSync(COPY_PATH, 'utf8')}\nmodule.exports.${compiledMarker} = function ${compiledMarker}() {};\n`;
  expect(source.startsWith(readFileSync(COPY_PATH, 'utf8'))).toBe(true);
  const loaded = new Module(COPY_PATH) as Module & { filename: string; paths: string[]; _compile(content: string, filename: string): void; exports: unknown };
  loaded.filename = COPY_PATH;
  loaded.paths = (Module as unknown as { _nodeModulePaths(path: string): string[] })._nodeModulePaths(dirname(COPY_PATH));
  loaded._compile(source, COPY_PATH);
  return loaded.exports;
}

describe('the gate vectors, evaluated by the verbatim spike gate functions', () => {
  /** Functions of the copy whose every block must run while the vectors are evaluated. */
  const COVERED = ['intentGate', 'operationTargetGate', 'actionGate', 'evidenceFor', 'norm', 'words', 'bound', 'parseOutline', 'subtree', 'g2', 'collapse'];

  it('reproduces the recorded harness verdicts with 0 differences on EXACT rows, and covers every branch of the gate functions (V8 precise coverage)', async () => {
    const session = new inspector.Session();
    session.connect();
    const post = (method: string, params?: object): Promise<unknown> => new Promise((resolve, reject) => { session.post(method, params ?? {}, (error, result) => { if (error) reject(error); else resolve(result); }); });
    await post('Profiler.enable');
    await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    const pure = compileFresh() as PureGates;

    const differences: string[] = [];
    let evaluated = 0;
    // ---- recorded rows
    for (const row of recorded.rows) {
      if (row.intent) {
        const verdict = pure.intentGate(row.intent.targetIntent ?? undefined, row.intent.node);
        expect(verdict, `${row.key} intent (stored spike verdict)`).toBe(row.intent.spike);
        if (row.class === 'EXACT' && verdict !== row.intent.recorded) differences.push(`${row.key} intent ${String(verdict)} != ${String(row.intent.recorded)}`);
        expect(intentOverFacts(pure, row.intent.targetIntent ?? undefined, row.intent.facts), `${row.key} intent over facts`).toBe(verdict);
        evaluated++;
      }
      if (row.operation) {
        const verdict = pure.operationTargetGate(row.operation.kind ?? undefined, row.operation.node);
        expect(verdict, `${row.key} operation (stored spike verdict)`).toBe(row.operation.spike);
        if (row.class === 'EXACT' && verdict !== row.operation.recorded) differences.push(`${row.key} operation ${String(verdict)} != ${String(row.operation.recorded)}`);
        evaluated++;
      }
      if (row.action) {
        const plan = recorded.plans[row.action.planId];
        const codes = pure.actionGate({ reply: row.action.reply, obligation: row.action.obligation, plan, inputs: row.action.inputs });
        expect(codes, `${row.key} action (stored spike verdict)`).toEqual(row.action.spike);
        if (codes.join(',') !== row.action.recorded.join(',')) differences.push(`${row.key} action ${codes.join('+')} != ${row.action.recorded.join('+')}`);
        evaluated++;
      }
      if (row.g2) {
        const input = { predicate: 'containsText', role: row.g2.role, text: row.g2.facts.text, descendantHidden: false };
        const overFacts = g2OverFacts(row.g2.literal, input);
        if (!row.g2.truncated && row.g2.spike.applies) expect(overFacts, `${row.key} G2 over facts`).toBe(row.g2.spike.refuseCI === true ? 'refuse' : 'pass');
        evaluated++;
      }
    }
    expect(evaluated).toBeGreaterThan(1200);
    expect(differences, 'EXACT rows whose verdict differs from the recording are findings; the rule must not be edited to hide them').toEqual([]);

    // ---- synthetic vectors
    for (const vector of synthetic.intent) {
      const intentInput = wantIntentInput(vector.targetIntent);
      expect(pure.intentGate(intentInput, vector.node ?? undefined), `${vector.id} ${vector.branch} (spike)`).toBe(vector.expectedSpike === undefined ? vector.expected : vector.expectedSpike);
      expect(intentOverFacts(pure, intentInput, vector.facts), `${vector.id} ${vector.branch} (facts)`).toBe(vector.expected);
    }
    for (const vector of synthetic.operation) expect(pure.operationTargetGate(vector.kind, vector.node ?? undefined), `${vector.id} ${vector.branch}`).toBe(vector.expected);
    for (const vector of synthetic.action) expect(pure.actionGate({ reply: vector.reply, obligation: vector.obligation, plan: vector.plan, inputs: vector.inputs }), `${vector.id} ${vector.branch}`).toEqual(vector.expected);
    for (const vector of synthetic.g2) {
      const hidden = vector.withheld === true || vector.descendant !== undefined;
      const overFacts = g2OverFacts(vector.literal, { predicate: vector.predicate, role: vector.role, text: vector.withheld === true ? null : vector.text, descendantHidden: vector.descendant !== undefined });
      expect(overFacts, `${vector.id} ${vector.branch} (over facts)`).toBe(vector.expected);
      const spikeCheckable = vector.predicate === 'containsText' && !NO_TEXT_ROLES.has(vector.role) && !(Array.from(vector.text).length >= 256 && vector.text.endsWith('…'));
      if (!spikeCheckable) continue;
      const parsed = pure.parseOutline(outlineForG2(vector));
      const result = pure.g2(parsed, parsed.byRef.get('e1'), vector.literal);
      const spikeVerdict = !result.applies ? 'notApplicable' : result.refuseCI === true ? 'refuse' : 'pass';
      if (vector.spikeDiffers !== undefined) expect(spikeVerdict, `${vector.id} ${vector.branch}: a documented divergence`).not.toBe(vector.expected);
      else expect(spikeVerdict, `${vector.id} ${vector.branch} (spike)`).toBe(vector.expected);
      expect(hidden || result.applies, vector.id).toBe(true);
    }
    for (const vector of synthetic.g2Outline) {
      const parsed = pure.parseOutline(vector.outline);
      const result = pure.g2(parsed, parsed.byRef.get(vector.ref), vector.literal);
      expect(result.applies, `${vector.id} ${vector.branch}`).toBe(vector.expected.applies);
      if (vector.expected.reason !== undefined) expect(result.reason, vector.id).toBe(vector.expected.reason);
      if (vector.expected.refuse !== undefined) expect([result.refuse, result.refuseCI], vector.id).toEqual([vector.expected.refuse, vector.expected.refuseCI]);
    }
    // evidence cap and the symbol-only norm, which the gates reach through evidenceFor / norm
    expect(pure.evidenceFor({ rawName: 'a'.repeat(300) }).endsWith('…')).toBe(true);
    expect(pure.norm('...')).toBe('...');
    // the helpers accept an absent value (the gates never pass one, the copy's contract does)
    expect(pure.norm(undefined as never)).toBe('');
    expect(pure.norm(null as never)).toBe('');
    expect(pure.bound(undefined as never)).toBe('');
    expect(pure.bound(null as never)).toBe('');

    // ---- coverage
    const taken = (await post('Profiler.takePreciseCoverage')) as { result: { url: string; functions: { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] }[] }[] };
    session.disconnect();
    // another instance of the copy may be loaded (the extractor imports it): the script of THIS run is the one with this run's marker function
    const script = taken.result.find((entry) => entry.functions.some((fn) => fn.functionName === compiledMarker));
    expect(script, 'V8 coverage of the gate copy is unavailable: AC6 mechanical coverage is NOT MET').toBeDefined();
    const functions = script?.functions ?? [];
    const targets = functions.filter((fn) => COVERED.includes(fn.functionName));
    expect(targets.map((fn) => fn.functionName).sort()).toEqual([...COVERED].sort());
    const within = (inner: { ranges: { startOffset: number }[] }, outer: { ranges: { startOffset: number; endOffset: number }[] }): boolean =>
      (inner.ranges[0]?.startOffset ?? -1) >= (outer.ranges[0]?.startOffset ?? 0) && (inner.ranges[0]?.startOffset ?? -1) < (outer.ranges[0]?.endOffset ?? 0);
    const required = functions.filter((fn) => targets.some((target) => within(fn, target)));
    const uncovered = required.flatMap((fn) => fn.ranges.filter((range) => range.count === 0).map((range) => `${fn.functionName || '(anonymous)'} [${String(range.startOffset)}, ${String(range.endOffset)})`));
    expect(uncovered, 'branches of the gate functions that no vector reaches').toEqual([]);
  });

  it('keeps the known divergences between the spike G2 and the ADR visible: exactly the NFKC rows', () => {
    expect(synthetic.g2.filter((row) => row.spikeDiffers !== undefined).map((row) => row.branch)).toEqual(['pass.nfkc']);
  });

  it('G2 over the recorded rows: the confident-wrong rows are refused and no correct row is', () => {
    for (const run of ['s3v2-20261027', 'wave2-20261027']) {
      const rows = recorded.rows.filter((row) => row.run === run && row.g2 !== undefined);
      const refused = (category: string): number => rows.filter((row) => row.category === category && row.g2?.spike.refuseCI === true).length;
      expect(refused('confidentWrong'), `${run} confident-wrong rows refused`).toBe(1);
      expect(refused('correct'), `${run} correct rows refused`).toBe(0);
    }
  });

  it('the disagreements that exist are all on PARTIAL rows, and are counted in the committed report', () => {
    const report = readFileSync(join(VECTORS_DIR, 'PARTIAL-ROWS.md'), 'utf8');
    const count = (gate: 'intent' | 'operation', klass: 'EXACT' | 'PARTIAL'): number =>
      recorded.rows.filter((row) => {
        const verdicts = row[gate];
        return row.class === klass && verdicts !== undefined && verdicts.recorded !== verdicts.spike;
      }).length;
    expect(count('intent', 'EXACT')).toBe(0);
    expect(count('operation', 'EXACT')).toBe(0);
    expect(report).toContain(`| intent | 430 | 0 | 98 | ${String(count('intent', 'PARTIAL'))} |`);
    expect(report).toContain(`| operation | 430 | 0 | 98 | ${String(count('operation', 'PARTIAL'))} |`);
  });
});
