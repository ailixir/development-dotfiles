'use strict';
// The facts table derived from SPIKE rendered nodes (the spike has no facts table). The definitions mirror
// ADR-SC-007 D3 and the offline G2 analysis: role, name (rawName, uncapped in the spike), editable, evidence (the
// spike's evidenceFor, which has no row sibling cells) and text. `pure` is test/fixtures/spike-pure/spike-pure.cjs.
const NO_TEXT_ROLES = new Set(['combobox', 'textbox', 'searchbox', 'spinbutton', 'slider', 'listbox']);

function shownRef(n, pure) {
  if (n.ref === undefined) return undefined;
  if (n.kind === 'text') return n.ref;
  return n.kind === 'node' && pure.showRef(n) ? n.ref : undefined;
}

function spikeFacts(nodes, shownIndexes, pure) {
  const facts = {};
  const hidden = (n) => n.withheld === true || ['password', 'withheld', 'unsupported'].includes(n.kind) || n.kids.some((k) => hidden(nodes[k]));
  const printed = (n) => {
    const out = [];
    const walk = (d) => {
      for (const k of d.kids) {
        const kid = nodes[k];
        if (kid.kind === 'node' && kid.name) out.push(pure.bound(kid.name));
        if (kid.kind === 'text') out.push(pure.bound(kid.text));
        walk(kid);
      }
    };
    walk(n);
    return out;
  };
  for (const i of [...shownIndexes].sort((a, b) => a - b)) {
    const n = nodes[i];
    const ref = shownRef(n, pure);
    if (ref === undefined || facts[ref] !== undefined) continue;
    const role = n.kind === 'text' ? 'text' : n.role;
    const entry = {
      role, name: n.kind === 'text' ? '' : (n.rawName ?? ''),
      editable: (n.states ?? []).includes('editable') || (n.role === 'combobox' && (n.tag === 'input' || n.tag === 'textarea')),
      evidence: pure.evidenceFor(n),
    };
    if (!NO_TEXT_ROLES.has(role) && !hidden(n)) {
      const own = n.kind === 'text' ? pure.bound(n.text) : n.name ? pure.bound(n.name) : '';
      entry.text = pure.bound([own, ...printed(n)].filter((part) => part !== '').join(' '), 256);
    }
    facts[ref] = entry;
  }
  return facts;
}

module.exports = { spikeFacts, shownRef };
