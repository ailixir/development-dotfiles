#!/usr/bin/env node
'use strict';
// Read-only. Prints the four GuidedContracts schema epochs for a contracts/v3 directory, computed with a Node
// replica of GuidedContracts.schema(name) -> expand($ref) -> canonical -> SHA-256 (backend, GuidedContracts.java).
//   node epoch-probe.cjs docs/specs/studio-observed-authoring/contracts/v3
// Proof of method (2026-10-18, before MODEL-SIZING): on the unmodified tree it reproduces all four constants in
// GuidedContracts.java (SESSION d94e7972..., REPLAY_VALIDATION 21d620f3..., LEDGER b1a71bd5..., OBSERVATION 9be57abe...).
// Run it on the OLD directory first when in doubt; then trust the new value.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dir = process.argv[2];
if (!dir) { console.error('usage: node epoch-probe.cjs <contracts/v3 directory>'); process.exit(2); }
const res = n => JSON.parse(fs.readFileSync(path.join(dir, n.replace(/^v3\//, '')), 'utf8'));
function expand(node, resourceName, document) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    if (Object.hasOwn(node, '$ref')) {
      const pre = node.$ref.split('#')[0];
      const frag = node.$ref.includes('#') ? node.$ref.split('#').slice(1).join('#') : null;
      const targetName = pre === '' ? resourceName : 'v3/' + pre.slice(pre.lastIndexOf('/') + 1);
      const doc = pre === '' ? document : res(targetName);
      const target = frag === null ? doc : frag.split('/').slice(1).reduce((v, k) => v[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
      return expand(target, targetName, doc);
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) if (!['$id', 'definitions', '$defs'].includes(k)) out[k] = expand(v, resourceName, document);
    return out;
  }
  if (Array.isArray(node)) return node.map(n => expand(n, resourceName, document));
  return node;
}
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
const hash = v => crypto.createHash('sha256').update(canon(v), 'utf8').digest('hex');
const out = {};
for (const n of ['session', 'replay-validation', 'ledger', 'observation']) {
  const rn = 'v3/' + n + '.schema.json';
  const doc = res(rn);
  out[n] = hash(expand(doc, rn, doc));
}
console.log(JSON.stringify(out, null, 2));
