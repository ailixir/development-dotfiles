// The AC6 classification rule of ADR-SC-007 WI-2, fixed BEFORE any recorded verdict was compared with a gate function.
//
// A recorded S3 row holds the request body the model saw (the sanitized, focus-projected OUTLINE), the reply and the plan, but not
// the rendered node the harness gate saw. The gate inputs are therefore rebuilt from the outline. A row is EXACT when every gate
// that applies to it has all its inputs in the outline, and PARTIAL when a gate input went through a lossy transform on its way into
// the outline. The rule is a pure function of FEATURES of the row (never of a verdict), and a verdict that differs on an EXACT row
// is a finding to report, not a reason to edit this file. goldenGateVectors.test.ts pins this file's sha256.
//
// The lossy transforms, enumerated up front:
//   L1 PROJECTION      the outline is the focus projection; when it carries the `… N more nodes not shown` tail, lines that belong to
//                      a gate input (child text lines, group names, sibling cells, headers) may have been cut.
//   L2 HEADER-GEOMETRY the row / column header names of a table cell are chosen by layout boxes in the page and are not in the outline.
//   L3 QUOTE-160       printed names, text and near strings are bound to 160 characters (the harness bound them to 256 for evidence).
//   L4 DOM-TAG         "combobox + fill" depends on the DOM tag (input / textarea / select), which the outline does not print.
//   L5 WHITESPACE      whitespace runs inside quotes are collapsed; norm() and words() collapse them too, so this one is benign (EXACT).
//   L6 STUB-NAME       a node rendered `{value withheld}` prints no name and the harness node had an empty rawName as well (EXACT).
// Action-gate inputs (reply, obligation, plan, inputs) are recorded verbatim and are always EXACT.

export const LOSSY_TRANSFORMS = Object.freeze({
  L1: 'PROJECTION',
  L2: 'HEADER-GEOMETRY',
  L3: 'QUOTE-160',
  L4: 'DOM-TAG',
  L5: 'WHITESPACE (benign)',
  L6: 'STUB-NAME (benign)',
});

export const TAIL_LINE = /^… \d+ more nodes not shown\s*$/mu;
const HEADER_ROLES = new Set(['cell', 'gridcell', 'columnheader', 'rowheader']);

/**
 * @param {{ hasTail: boolean, targetIsNode: boolean, role: string | null, operationKind: string | null, predicate: string | null, truncatedQuote: boolean }} features
 * @returns {{ class: 'EXACT' | 'PARTIAL', partial: { gate: string, transform: string, lacks: string }[], applies: { intent: boolean, operation: boolean, g2: boolean } }}
 */
export function classifyRow(features) {
  const partial = [];
  const applies = {
    intent: features.targetIsNode,
    operation: features.targetIsNode,
    g2: features.targetIsNode && features.operationKind === 'assert' && features.predicate === 'containsText',
  };
  if (applies.intent) {
    if (features.hasTail) partial.push({ gate: 'intent', transform: 'L1', lacks: 'lines cut by the projection (own text, group name)' });
    if (HEADER_ROLES.has(features.role ?? '')) partial.push({ gate: 'intent', transform: 'L2', lacks: 'row / column header names of the cell' });
    if (features.truncatedQuote) partial.push({ gate: 'intent', transform: 'L3', lacks: 'text beyond the 160-character quote' });
  }
  if (applies.operation && features.operationKind === 'fill' && features.role === 'combobox') {
    partial.push({ gate: 'operation', transform: 'L4', lacks: 'DOM tag (input / textarea / select) of the combobox' });
  }
  if (applies.g2) {
    if (features.hasTail) partial.push({ gate: 'g2', transform: 'L1', lacks: 'descendant lines cut by the projection' });
    if (features.truncatedQuote) partial.push({ gate: 'g2', transform: 'L3', lacks: 'text beyond the 160-character quote' });
  }
  return { class: partial.length === 0 ? 'EXACT' : 'PARTIAL', partial, applies };
}
