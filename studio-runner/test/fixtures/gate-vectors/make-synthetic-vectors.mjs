// Authors test/fixtures/gate-vectors/synthetic-gate-vectors.json: hand-written inputs WITH hand-written expected verdicts for every
// branch of the intent, operation-vs-role, G2 and action gates of ADR-SC-007 D3. The expected verdicts come from the ADR and
// INTERFACES.md, not from running the spike functions; goldenGateVectors.test.ts then checks the verbatim spike functions against
// them, so a disagreement is a finding (`spikeDiffers` lists the ones that are known and why).
//
//   node test/fixtures/gate-vectors/make-synthetic-vectors.mjs           write the fixture
//   node test/fixtures/gate-vectors/make-synthetic-vectors.mjs --check   the committed fixture must equal this generator's output
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import spike from '../spike-pure/spike-pure.cjs';

const here = dirname(fileURLToPath(import.meta.url));

// ---- intent gate -------------------------------------------------------------------------------------------------------------
const node = (fields) => ({ kind: 'node', rawName: '', ...fields });
const intent = [];
const addIntent = (branch, targetIntent, n, expected, extra = {}) => {
  const evidenceNode = n === null ? null : n;
  intent.push({
    id: `intent-${String(intent.length + 1).padStart(2, '0')}`, branch, targetIntent: targetIntent === undefined ? { omitted: true } : targetIntent, node: n,
    facts: evidenceNode === null ? { name: '', evidence: '' } : { name: evidenceNode.rawName ?? '', evidence: spike.evidenceFor(evidenceNode) }, expected, ...extra,
  });
};
// INTENT_MISSING: undefined, null, empty, whitespace, a non-string
addIntent('missing.undefined', undefined, node({ rawName: 'Search' }), 'INTENT_MISSING');
addIntent('missing.null', null, node({ rawName: 'Search' }), 'INTENT_MISSING');
addIntent('missing.empty', '', node({ rawName: 'Search' }), 'INTENT_MISSING');
addIntent('missing.whitespace', '   \t ', node({ rawName: 'Search' }), 'INTENT_MISSING');
addIntent('missing.nonString', 42, node({ rawName: '42' }), 'INTENT_MISSING');
addIntent('symbolOnlyIsNotMissing.equalsName', '+', node({ rawName: '+' }), null);
addIntent('symbolOnlyIsNotMissing.wordless', '+', node({ rawName: 'plus', ownText: 'plus sign' }), 'INTENT_MISMATCH');
// name equality (norm: NFKC, case, whitespace, edge punctuation)
addIntent('name.equal', 'Sign in', node({ rawName: 'Sign in' }), null);
addIntent('name.case', 'SIGN IN', node({ rawName: 'sign in' }), null);
addIntent('name.edgePunctuation', 'Sign in!', node({ rawName: '"Sign in"' }), null);
addIntent('name.nfkc', 'Ｓｉｇｎ in', node({ rawName: 'Sign in' }), null);
addIntent('name.whitespace', 'Sign   in', node({ rawName: ' Sign in ' }), null);
// intent with no words: passes only by name equality
addIntent('wordless.equalToName', 'x', node({ rawName: 'x' }), null);
addIntent('wordless.notEqual', 'x', node({ rawName: 'xy', ownText: 'x marks the spot' }), 'INTENT_MISMATCH');
// word subset of the evidence, through each evidence field
addIntent('subset.name', 'search', node({ rawName: 'Search the site' }), null);
addIntent('subset.placeholder', 'email address', node({ rawName: '', placeholder: 'Enter your email address' }), null);
addIntent('subset.near', 'password', node({ rawName: '', near: 'Password' }), null);
addIntent('subset.ownText', 'continue', node({ rawName: 'Next', ownText: 'Continue to payment' }), null);
addIntent('subset.text', 'welcome', { kind: 'text', text: 'Welcome back' }, null);
addIntent('subset.groupName', 'small', node({ rawName: 'S', groupName: 'Small or large' }), null);
addIntent('subset.headers', 'status', node({ rawName: '(Unused)', headers: ['Status', 'Description'] }), null);
addIntent('subset.severalFields', 'status unused', node({ rawName: '(Unused)', headers: ['Status'] }), null);
addIntent('subset.fails', 'delete account', node({ rawName: 'Delete', ownText: 'items' }), 'INTENT_MISMATCH');
addIntent('subset.wordOutsideEvidenceCap', 'zzzlast', node({ rawName: 'a'.repeat(300), ownText: 'zzzlast' }), 'INTENT_MISMATCH');
addIntent('node.undefined', 'Search', null, 'INTENT_MISMATCH');
// sibling-cell evidence (ADR D3, iana-assert-01): the spike evidence lacks the sibling, the facts evidence has it
intent.push({
  id: `intent-${String(intent.length + 1).padStart(2, '0')}`, branch: 'subset.siblingCells.iana-assert-01', targetIntent: '418 description',
  node: node({ rawName: '(Unused)', ownText: '', headers: ['Description'] }), facts: { name: '(Unused)', evidence: '(Unused) Description 418' },
  expected: null, expectedSpike: 'INTENT_MISMATCH',
  note: 'The recorded failure of iana-assert-01: the spike evidence has no sibling cells, so the correct value cell was refused. With the key cell "418" in the evidence the intent passes.',
});

// ---- operation-vs-role gate ----------------------------------------------------------------------------------------------------
const operation = [];
const addOp = (branch, kind, n, expected) => operation.push({ id: `operation-${String(operation.length + 1).padStart(2, '0')}`, branch, kind, node: n, expected });
const role = (r, extra = {}) => ({ kind: 'node', role: r, states: [], ...extra });
const REFUSED = 'OPERATION_TARGET_MISMATCH';
for (const r of ['textbox', 'searchbox', 'spinbutton']) addOp(`fill.${r}`, 'fill', role(r), null);
addOp('fill.editableRoot', 'fill', role('generic', { states: ['editable'] }), null);
addOp('fill.combobox.input', 'fill', role('combobox', { tag: 'input' }), null);
addOp('fill.combobox.textarea', 'fill', role('combobox', { tag: 'textarea' }), null);
addOp('fill.combobox.select', 'fill', role('combobox', { tag: 'select' }), REFUSED);
addOp('fill.combobox.noTag', 'fill', role('combobox'), REFUSED);
addOp('fill.button', 'fill', role('button'), REFUSED);
addOp('fill.link', 'fill', role('link'), REFUSED);
addOp('fill.textNode', 'fill', { kind: 'text', text: 'x' }, REFUSED);
addOp('fill.undefinedNode', 'fill', null, REFUSED);
addOp('fill.statesMissing', 'fill', { kind: 'node', role: 'generic' }, REFUSED);
for (const r of ['combobox', 'listbox', 'option', 'radio', 'menuitemradio']) addOp(`selectOption.${r}`, 'selectOption', role(r), null);
for (const r of ['radiogroup', 'button', 'checkbox', 'textbox']) addOp(`selectOption.${r}`, 'selectOption', role(r), REFUSED);
addOp('selectOption.undefinedNode', 'selectOption', null, REFUSED);
for (const kind of ['check', 'uncheck']) {
  for (const r of ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']) addOp(`${kind}.${r}`, kind, role(r), null);
  for (const r of ['button', 'textbox', 'link']) addOp(`${kind}.${r}`, kind, role(r), REFUSED);
}
for (const kind of ['click', 'press', 'read', 'assert']) {
  addOp(`${kind}.unrestricted.button`, kind, role('button'), null);
  addOp(`${kind}.unrestricted.undefinedNode`, kind, null, null);
}
addOp('unknownKind.unrestricted', 'hover', role('generic'), null);
addOp('undefinedKind.unrestricted', undefined, role('button'), null);

// ---- G2 ASSERT_TEXT_ABSENT ---------------------------------------------------------------------------------------------------
// facts-shaped rows: the verdict is refuse | pass | notApplicable. The spike function sees the same target as an outline.
const g2 = [];
const addG2 = (branch, input, expected, extra = {}) => g2.push({ id: `g2-${String(g2.length + 1).padStart(2, '0')}`, branch, ...input, expected, ...extra });
const cell = (text, extra = {}) => ({ predicate: 'containsText', role: 'cell', text, ...extra });
addG2('refuse.absent', { ...cell('Order accepted'), literal: 'Order rejected' }, 'refuse');
addG2('pass.substring', { ...cell('Order accepted for shipping'), literal: 'accepted' }, 'pass');
addG2('pass.caseInsensitive', { ...cell('Order accepted'), literal: 'ORDER ACCEPTED' }, 'pass');
addG2('pass.whitespaceCollapse', { ...cell('Order   accepted'), literal: 'Order accepted' }, 'pass');
addG2('pass.literalWhitespaceCollapse', { ...cell('Order accepted'), literal: ' Order   accepted ' }, 'pass');
addG2('pass.emptyLiteral', { ...cell('anything'), literal: '' }, 'pass');
addG2('refuse.emptyText', { ...cell(''), literal: 'x' }, 'refuse');
addG2('pass.nfkc', { ...cell('Order accepted'), literal: 'Ｏｒｄｅｒ accepted' }, 'pass', { spikeDiffers: 'The spike G2 compares case-insensitively but not under NFKC; ADR D3 says NFKC and case-insensitive.' });
addG2('refuse.heading', { predicate: 'containsText', role: 'heading', text: 'Overview', literal: 'Summary' }, 'refuse');
addG2('notApplicable.targetWithheld', { ...cell('ignored'), withheld: true, literal: 'x' }, 'notApplicable');
addG2('notApplicable.descendantWithheld', { ...cell('Order accepted'), literal: 'zzz', descendant: 'withheld' }, 'notApplicable');
addG2('notApplicable.descendantPassword', { ...cell('Order accepted'), literal: 'zzz', descendant: 'password' }, 'notApplicable');
addG2('notApplicable.descendantSensitive', { ...cell('Order accepted'), literal: 'zzz', descendant: 'sensitive' }, 'notApplicable');
addG2('notApplicable.descendantUnsupported', { ...cell('Order accepted'), literal: 'zzz', descendant: 'unsupported' }, 'notApplicable');
for (const r of ['combobox', 'textbox', 'searchbox', 'spinbutton', 'slider', 'listbox']) addG2(`notApplicable.valueRole.${r}`, { predicate: 'containsText', role: r, text: 'something', literal: 'zzz' }, 'notApplicable');
addG2('notApplicable.predicateVisible', { predicate: 'visible', role: 'cell', text: 'x', literal: 'zzz' }, 'notApplicable');
addG2('notApplicable.predicateHasValue', { predicate: 'hasValue', role: 'cell', text: 'x', literal: 'zzz' }, 'notApplicable');
addG2('notApplicable.truncatedText', { ...cell(`${'w'.repeat(255)}…`), literal: 'beyond the cap' }, 'notApplicable');
addG2('pass.longTextNotTruncated', { ...cell('w'.repeat(255)), literal: 'www' }, 'pass');
// outline-shaped rows: parse branches of the offline G2 (the source of the recorded G2 verdicts)
const outlineRows = [];
const addOutline = (branch, outline, ref, literal, expected) => outlineRows.push({ id: `g2-outline-${String(outlineRows.length + 1).padStart(2, '0')}`, branch, outline, ref, literal, expected });
addOutline('targetNotInOutline', '- document\n  - button "Go" [e1]', 'e9', 'Go', { applies: false, reason: 'TARGET_NOT_IN_OUTLINE' });
addOutline('targetWithheld', '- cell [e1] {value withheld}', 'e1', 'x', { applies: false, reason: 'TARGET_WITHHELD' });
addOutline('descendantWithheldLine', '- cell "a" [e1]\n  - text "b"\n  - generic [e2] {value withheld}', 'e1', 'x', { applies: false, reason: 'DESCENDANT_WITHHELD' });
addOutline('descendantPasswordLine', '- cell "a" [e1]\n  - passwordControl', 'e1', 'x', { applies: false, reason: 'DESCENDANT_WITHHELD' });
addOutline('descendantWithheldSensitive', '- cell "a" [e1]\n  - withheld {sensitive}', 'e1', 'x', { applies: false, reason: 'DESCENDANT_WITHHELD' });
addOutline('descendantUnsupportedSurface', '- cell "a" [e1]\n  - canvas {unsupported surface}', 'e1', 'x', { applies: false, reason: 'DESCENDANT_WITHHELD' });
addOutline('refuse', '- cell "Order accepted" [e1]', 'e1', 'rejected', { applies: true, refuse: true, refuseCI: true });
addOutline('caseOnlyDifference', '- cell "Order Accepted" [e1]', 'e1', 'order accepted', { applies: true, refuse: true, refuseCI: false });
addOutline('descendantNamesCount', '- row [e1]\n  - cell "Language"\n  - cell "English"', 'e1', 'English', { applies: true, refuse: false, refuseCI: false });
addOutline('moreOptionsLineIsSkippedNotATerminator', '- combobox "A" [e1]\n  - option "x"\n  … 3 more options\n  - option "after-more"', 'e1', 'after-more', { applies: true, refuse: false, refuseCI: false });
addOutline('moreNodesTailEndsSubtree', '- cell "a" [e1]\n  - text "b"\n… 7 more nodes not shown', 'e1', 'b', { applies: true, refuse: false, refuseCI: false });
addOutline('unparsedLineEndsSubtree', '- cell "a" [e1]\n  - text "b"\nnot a node line\n  - text "after"', 'e1', 'after', { applies: true, refuse: true, refuseCI: true });
addOutline('truncatedQuote', `- cell "${'w'.repeat(159)}…" [e1]`, 'e1', 'beyond', { applies: true, refuse: true, refuseCI: true, truncated: true });
addOutline('invalidJsonEscapeInQuote', '- cell "bad \\q escape" [e1]', 'e1', 'escape', { applies: true, refuse: false, refuseCI: false });
addOutline('selectedStateIsParsed', '- option "A" [e1] {selected}', 'e1', 'A', { applies: true, refuse: false, refuseCI: false });
addOutline('subtreeEndsAtTheNextSibling', '- cell "a" [e1]\n- cell "b" [e2]', 'e1', 'b', { applies: true, refuse: true, refuseCI: true });
addOutline('lineWithoutName', '- cell [e1]\n  - text "inside"', 'e1', 'inside', { applies: true, refuse: false, refuseCI: false });

// ---- action gate -----------------------------------------------------------------------------------------------------------------
const action = [];
const LITERAL_REF = { kind: 'authoredLiteral', stepId: 's1', startUtf16: 0, endUtf16: 3 };
const ob = (fields) => ({ obligationId: 'o1', operationKind: 'fill', referenceIndex: null, needId: null, predicate: null, targetIntent: 'Email', ...fields });
const plan = (obligation, fields = {}) => ({ sourceReferences: [LITERAL_REF], obligations: [obligation], needs: [{ needId: 'n1', bindingId: 'b1' }], ...fields });
const addAction = (branch, reply, obligation, planFields, inputs, expected) => action.push({ id: `action-${String(action.length + 1).padStart(2, '0')}`, branch, reply, obligation, plan: plan(obligation, planFields), inputs, expected });
const nodeTarget = (extra = {}) => ({ kind: 'node', ref: 'e1', ...extra });
const reply = (op, target = nodeTarget()) => ({ action: { target, operation: op } });
const fillLit = (id = 'in-1') => ({ kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: id } });
const INPUTS = [{ inputId: 'in-1' }];
addAction('clean.fillLiteral', reply(fillLit()), ob({ referenceIndex: 0 }), {}, INPUTS, []);
addAction('clean.click', reply({ kind: 'click' }), ob({ operationKind: 'click' }), {}, INPUTS, []);
addAction('operation.missing', { action: { target: nodeTarget() } }, ob({ operationKind: 'click' }), {}, INPUTS, ['OPERATION_MISMATCH']);
addAction('operation.noAction', {}, ob({ operationKind: 'click' }), {}, INPUTS, ['OPERATION_MISMATCH']);
addAction('operation.wrongKind', reply({ kind: 'click' }), ob({ operationKind: 'fill' }), {}, INPUTS, ['OPERATION_MISMATCH']);
addAction('reference.wrongSourceInputId', reply(fillLit('in-9')), ob({ referenceIndex: 0 }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('reference.noInputs', reply(fillLit()), ob({ referenceIndex: 0 }), {}, [], ['VALUE_MISMATCH']);
addAction('reference.valueMissing', reply({ kind: 'fill' }), ob({ referenceIndex: 0 }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('reference.missingSourceReferencesEntry', reply(fillLit()), ob({ referenceIndex: 3 }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('reference.secretRefOk', reply({ kind: 'fill', value: { kind: 'secretRef', sourceInputId: 'in-1' } }, { kind: 'passwordControl' }), ob({ referenceIndex: 0 }), { sourceReferences: [{ kind: 'secretRef', stepId: 's1', startUtf16: 0, endUtf16: 3 }] }, INPUTS, []);
addAction('reference.secretRefExpectedButLiteralGiven', reply(fillLit()), ob({ referenceIndex: 0 }), { sourceReferences: [{ kind: 'secretRef', stepId: 's1', startUtf16: 0, endUtf16: 3 }] }, INPUTS, ['VALUE_MISMATCH']);
addAction('reference.literalExpectedButSecretGiven', reply({ kind: 'fill', value: { kind: 'secretRef', sourceInputId: 'in-1' } }, { kind: 'passwordControl' }), ob({ referenceIndex: 0 }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('reference.secondUsedReference', reply(fillLit('in-2')), ob({ obligationId: 'o2', referenceIndex: 1 }), {
  sourceReferences: [LITERAL_REF, { kind: 'authoredLiteral', stepId: 's2', startUtf16: 0, endUtf16: 2 }],
  obligations: [ob({ referenceIndex: 0 }), ob({ obligationId: 'o2', referenceIndex: 1 })],
}, [{ inputId: 'in-1' }, { inputId: 'in-2' }], []);
addAction('reference.sameReferenceUsedTwice', reply(fillLit()), ob({ referenceIndex: 0 }), { obligations: [ob({ referenceIndex: 0 }), ob({ obligationId: 'o2', referenceIndex: 0 })] }, INPUTS, []);
addAction('reference.assertExpected', reply({ kind: 'assert', predicate: 'containsText', expected: { kind: 'authoredLiteral', sourceInputId: 'in-1' } }), ob({ operationKind: 'assert', predicate: 'containsText', referenceIndex: 0 }), {}, INPUTS, []);
addAction('reference.navigateOk', reply({ kind: 'navigate', destinationInputId: 'in-1' }, { kind: 'page' }), ob({ operationKind: 'navigate', referenceIndex: 0 }), {}, INPUTS, []);
addAction('reference.navigateWrongDestination', reply({ kind: 'navigate', destinationInputId: 'in-9' }, { kind: 'page' }), ob({ operationKind: 'navigate', referenceIndex: 0 }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('need.readBindingOk', reply({ kind: 'read', bindingId: 'b1' }), ob({ operationKind: 'read', needId: 'n1' }), {}, INPUTS, []);
addAction('need.readBindingWrong', reply({ kind: 'read', bindingId: 'b9' }), ob({ operationKind: 'read', needId: 'n1' }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('need.bindingValueOk', reply({ kind: 'fill', value: { kind: 'binding', bindingId: 'b1' } }), ob({ needId: 'n1' }), {}, INPUTS, []);
addAction('need.bindingValueWrongKind', reply(fillLit()), ob({ needId: 'n1' }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('need.bindingValueWrongId', reply({ kind: 'fill', value: { kind: 'binding', bindingId: 'b9' } }), ob({ needId: 'n1' }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('need.unknownNeed', reply({ kind: 'read', bindingId: 'b1' }), ob({ operationKind: 'read', needId: 'n9' }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('need.plansWithoutNeeds', reply({ kind: 'read', bindingId: 'b1' }), ob({ operationKind: 'read', needId: 'n1' }), { needs: undefined }, INPUTS, ['VALUE_MISMATCH']);
addAction('dedupe.referenceAndNeedBothMismatch', reply(fillLit('in-9')), ob({ referenceIndex: 0, needId: 'n1' }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('need.mismatchAfterReferenceOk', reply(fillLit()), ob({ referenceIndex: 0, needId: 'n1' }), {}, INPUTS, ['VALUE_MISMATCH']);
addAction('policy.secretRefWithoutPasswordControl', reply({ kind: 'fill', value: { kind: 'secretRef', sourceInputId: 'in-1' } }), ob({ referenceIndex: 0 }), { sourceReferences: [{ kind: 'secretRef', stepId: 's1', startUtf16: 0, endUtf16: 3 }] }, INPUTS, ['POLICY_DENIED']);
addAction('policy.secretRefOnNonFill', reply({ kind: 'assert', predicate: 'containsText', expected: { kind: 'secretRef', sourceInputId: 'in-1' } }, { kind: 'passwordControl' }), ob({ operationKind: 'assert', predicate: 'containsText', referenceIndex: 0 }), { sourceReferences: [{ kind: 'secretRef', stepId: 's1', startUtf16: 0, endUtf16: 3 }] }, INPUTS, ['POLICY_DENIED']);
addAction('policy.passwordControlWithoutSecretRef', reply(fillLit(), { kind: 'passwordControl' }), ob({ referenceIndex: 0 }), {}, INPUTS, ['POLICY_DENIED']);
addAction('predicate.mismatch', reply({ kind: 'assert', predicate: 'visible', expected: { kind: 'authoredLiteral', sourceInputId: 'in-1' } }), ob({ operationKind: 'assert', predicate: 'containsText', referenceIndex: 0 }), {}, INPUTS, ['PREDICATE_MISMATCH']);
addAction('predicate.ok', reply({ kind: 'assert', predicate: 'visible', expected: { kind: 'authoredLiteral', sourceInputId: 'in-1' } }), ob({ operationKind: 'assert', predicate: 'visible', referenceIndex: 0 }), {}, INPUTS, []);
addAction('several.operationAndValueAndPredicate', reply({ kind: 'assert', predicate: 'visible', expected: { kind: 'authoredLiteral', sourceInputId: 'in-9' } }), ob({ operationKind: 'assert', predicate: 'containsText', referenceIndex: 0 }), {}, INPUTS, ['VALUE_MISMATCH', 'PREDICATE_MISMATCH']);
addAction('several.operationAndPolicy', reply({ kind: 'click' }, { kind: 'passwordControl' }), ob({ operationKind: 'fill' }), {}, INPUTS, ['OPERATION_MISMATCH', 'POLICY_DENIED']);

export function build() {
  return { schemaVersion: 1, note: 'Hand-written inputs and expected verdicts (ADR-SC-007 D3, INTERFACES.md). See make-synthetic-vectors.mjs.', intent, operation, g2, g2Outline: outlineRows, action };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = `${JSON.stringify(build(), null, 1)}\n`;
  const target = join(here, 'synthetic-gate-vectors.json');
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) { console.error('synthetic-gate-vectors.json differs from the generator output'); process.exitCode = 1; } else console.log('synthetic-gate-vectors.json is current');
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${target}`);
  }
}
