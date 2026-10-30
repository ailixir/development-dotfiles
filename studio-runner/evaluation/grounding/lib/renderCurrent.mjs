// SPK-07 S1/S2: LOSSLESS outline of today's Observation (stage S1: prompt only, no schema or hash change).
// Port of the verified prototype scratchpad/e5/fmt/roundtrip.py (encode + decoder). The decoder is part of the contract:
// `decode(encode(o), extras)` must equal `o` exactly (canonical JSON), and the arms refuse to send an outline that does not.
//
// What the outline carries: every node field and the page/coverage header. It does NOT carry the four top-level fields the
// request context already holds elsewhere: schemaVersion, sessionId, scopeHash, observedAt (passed back in as `extras`).
//
// Syntax (also the S1 contract text):
//   page "<origin>" doc=<documentId> gen=<generation> ids=<prefix>N
//   coverage mode=.. reason=.. complete=.. truncated=.. withheld=N passwords=N
//   rule rK=<policyRuleId>                      (one per non-default policy rule)
//   <indent 2*depth>- <role> "<name>" [eN] <flags...> loc=<hints|->
// nodeId is <prefix> + N for [eN]. Flags (omitted when equal to the default):
//   el=<elementType> (default from role) ct=<controlType> act|noact (default from elementType) hidden read|value rule=rK
//   up=eM (parentNodeId) region=eM|- (only when regionId differs from parent) form=eM labels=eA,eB
// loc= lists locatorHints joined by "|": `role` = {kind:role, role:<node role>, name:<node name>}; `role=<r>:"<n>"` another role
// hint; `label|testId|text|placeholder` = {kind, value:<node name>}; `kind="<v>"` = {kind, value:<v>}. All hints are exact.
import { canonical } from './requests.mjs';

const STRUCT = 'observed-structure-v1';
const EL = { link: 'link', button: 'button', textbox: 'input', searchbox: 'input', combobox: 'select', generic: 'text' };
const ACT = new Set(['link', 'button', 'input', 'select', 'textarea']);
const CLASSIFICATION_FLAG = { permittedBusinessData: 'read', nonsecretApproved: 'value' };
const q = value => JSON.stringify(value);
const fail = reason => { throw new Error(`OUTLINE_NOT_LOSSLESS ${reason}`); };
const sameKeys = (object, keys) => JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort());
const NODE_KEYS = ['actionable', 'classification', 'controlType', 'depth', 'documentId', 'elementType', 'formId', 'generation', 'labelNodeIds', 'locatorHints', 'name', 'nodeId', 'parentNodeId', 'policyRuleId', 'regionId', 'role', 'visible'];

export function encode(o) {
  const rules = [...new Set(o.nodes.map(n => n.policyRuleId))].filter(r => r !== STRUCT).sort();
  const prefix = o.nodes.length ? `${o.nodes[0].nodeId.slice(0, o.nodes[0].nodeId.lastIndexOf('-'))}-` : '';
  if (!/^\S*$/u.test(prefix) || !/^\S+$/u.test(o.documentId)) fail('header token');
  for (const n of o.nodes) {
    if (!n.nodeId.startsWith(prefix) || !/^\d+$/u.test(n.nodeId.slice(prefix.length)) || n.documentId !== o.documentId || n.generation !== o.generation) fail(`node id ${n.nodeId}`);
    if (!sameKeys(n, NODE_KEYS)) fail(`node keys ${Object.keys(n).join(',')}`);
  }
  const short = id => `e${id.slice(prefix.length)}`;
  const c = o.coverage;
  const head = [`page ${q(o.origin)} doc=${o.documentId} gen=${o.generation} ids=${prefix}N`,
    `coverage mode=${c.mode} reason=${c.reason} complete=${c.complete} truncated=${c.truncated} withheld=${c.withheldRegions} passwords=${c.passwordControls}`];
  for (const [i, rule] of rules.entries()) head.push(`rule r${i}=${rule}`);
  const body = o.nodes.map(n => {
    if (!/^\S+$/u.test(n.role) || !Number.isInteger(n.depth) || n.depth < 0) fail('role/depth');
    const el = EL[n.role] ?? 'other';
    let line = `${'  '.repeat(n.depth)}- ${n.role}${n.name ? ` ${q(n.name)}` : ''} [${short(n.nodeId)}]`;
    const f = [];
    if (n.elementType !== el) f.push(`el=${n.elementType}`);
    if (n.controlType !== 'none') f.push(`ct=${n.controlType}`);
    if (n.actionable !== ACT.has(n.elementType)) f.push(n.actionable ? 'act' : 'noact');
    if (!n.visible) f.push('hidden');
    if (n.classification !== 'structuralOnly') { if (!(n.classification in CLASSIFICATION_FLAG)) fail('classification'); f.push(CLASSIFICATION_FLAG[n.classification]); }
    if (n.policyRuleId !== STRUCT) f.push(`rule=r${rules.indexOf(n.policyRuleId)}`);
    if (n.parentNodeId) f.push(`up=${short(n.parentNodeId)}`);
    if (n.regionId !== n.parentNodeId) f.push(`region=${n.regionId ? short(n.regionId) : '-'}`);
    if (n.formId) f.push(`form=${short(n.formId)}`);
    if (n.labelNodeIds.length) f.push(`labels=${n.labelNodeIds.map(short).join(',')}`);
    const hints = n.locatorHints.map(h => {
      if (h.exact !== true || !/^[a-zA-Z]+$/u.test(h.kind)) fail('hint');
      if (h.kind === 'role') {
        if (!sameKeys(h, ['kind', 'role', 'name', 'exact']) || !/^[a-z]+$/u.test(h.role)) fail('role hint');
        return h.role === n.role && h.name === n.name ? 'role' : `role=${h.role}:${q(h.name)}`;
      }
      if (!sameKeys(h, ['kind', 'value', 'exact'])) fail('value hint');
      return h.value === n.name ? h.kind : `${h.kind}=${q(h.value)}`;
    });
    f.push(`loc=${hints.length ? hints.join('|') : '-'}`);
    return `${line} ${f.join(' ')}`;
  });
  return [...head, ...body].join('\n');
}

const JS = String.raw`"(?:[^"\\]|\\[\s\S])*"`;
const HEAD = new RegExp(String.raw`^page (${JS}) doc=(\S+) gen=(\d+) ids=(\S*)N$`);
const LINE = new RegExp(String.raw`^( *)- (\S+)(?: (${JS}))? \[(e\d+)\] ?([\s\S]*)$`);
const TOKEN = new RegExp(String.raw`[a-z]+=(?:[^ "]*${JS}(?:\|[^ "]*(?:${JS})?)*|\S+)|\S+`, 'g');
const HINT = new RegExp(String.raw`[a-zA-Z]+(?:=(?:[a-z]+:)?${JS})?`, 'g');

export function decode(text, { schemaVersion, sessionId, scopeHash, observedAt }) {
  const lines = text.split('\n');
  const head = HEAD.exec(lines[0]);
  if (!head) fail('page line');
  const origin = JSON.parse(head[1]); const doc = head[2]; const gen = Number(head[3]); const prefix = head[4];
  const kv = Object.fromEntries(lines[1].split(' ').slice(1).map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]));
  const coverage = { mode: kv.mode, reason: kv.reason, complete: kv.complete === 'true', truncated: kv.truncated === 'true', withheldRegions: Number(kv.withheld), passwordControls: Number(kv.passwords) };
  const rules = []; let i = 2;
  while (i < lines.length && lines[i].startsWith('rule ')) { rules.push(lines[i].slice(lines[i].indexOf('=') + 1)); i++; }
  const long = s => prefix + s.slice(1);
  const nodes = [];
  for (const ln of lines.slice(i)) {
    const m = LINE.exec(ln);
    if (!m) fail(`node line ${ln.slice(0, 60)}`);
    const depth = m[1].length / 2; const role = m[2]; const name = m[3] ? JSON.parse(m[3]) : ''; const nid = m[4];
    const f = {};
    for (const token of m[5].match(TOKEN) ?? []) { const at = token.indexOf('='); if (at < 0) f[token] = true; else f[token.slice(0, at)] = token.slice(at + 1); }
    const el = f.el ?? EL[role] ?? 'other';
    const actionable = f.act ? true : f.noact ? false : ACT.has(el);
    const hints = [];
    if (f.loc !== '-') {
      for (const h of f.loc.match(HINT) ?? []) {
        const at = h.indexOf('='); const k = at < 0 ? h : h.slice(0, at); const v = at < 0 ? null : h.slice(at + 1);
        if (k === 'role') {
          if (v === null) hints.push({ kind: 'role', role, name, exact: true });
          else { const colon = v.indexOf(':'); hints.push({ kind: 'role', role: v.slice(0, colon), name: JSON.parse(v.slice(colon + 1)), exact: true }); }
        } else hints.push({ kind: k, value: v === null ? name : JSON.parse(v), exact: true });
      }
    }
    const parent = f.up ? long(f.up) : null;
    const region = f.region === undefined ? parent : f.region === '-' ? null : long(f.region);
    nodes.push({ nodeId: long(nid), documentId: doc, generation: gen, role, name, elementType: el, controlType: f.ct ?? 'none',
      classification: f.read ? 'permittedBusinessData' : f.value ? 'nonsecretApproved' : 'structuralOnly', policyRuleId: f.rule ? rules[Number(f.rule.slice(1))] : STRUCT,
      visible: !f.hidden, actionable, depth, parentNodeId: parent, regionId: region, formId: f.form ? long(f.form) : null,
      labelNodeIds: f.labels ? f.labels.split(',').map(long) : [], locatorHints: hints });
  }
  return { schemaVersion, sessionId, documentId: doc, generation: gen, origin, scopeHash, observedAt, coverage, nodes };
}

/** The lossless guarantee, checked on the spot: outline plus the four extras reproduces the observation exactly. */
export function roundTrips(o, outline = encode(o)) {
  const { schemaVersion, sessionId, scopeHash, observedAt } = o;
  return canonical(decode(outline, { schemaVersion, sessionId, scopeHash, observedAt })) === canonical(o);
}
