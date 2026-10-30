// Extracts the golden gate vectors of ADR-SC-007 WI-2 from the recorded S3 runs (read-only):
//   evaluation/grounding/runs/s3v2-20261027  and  evaluation/grounding/runs/wave2-20261027
// and writes test/fixtures/gate-vectors/s3-gate-vectors.json.
//
//   node test/fixtures/gate-vectors/extract-gate-vectors.mjs           write the fixture
//   node test/fixtures/gate-vectors/extract-gate-vectors.mjs --check   re-extract and require the committed fixture to be identical
//
// The runs record the request body (the outline the model saw), the reply, the plan and the harness gate codes, but not the
// rendered node the harness gate saw. The node is rebuilt from the outline, and each row is classified EXACT or PARTIAL by
// classification.mjs (fixed before any verdict was compared). Verdicts are computed by the committed VERBATIM copy of the spike
// gate functions (../spike-pure/spike-pure.cjs), never by the untracked spike directory.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import spike from '../spike-pure/spike-pure.cjs';
import { TAIL_LINE, classifyRow } from './classification.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const RUNS_DIR = join(root, 'evaluation', 'grounding', 'runs');
const RUNS = ['s3v2-20261027', 'wave2-20261027'];
const ACTION_CODES = ['OPERATION_MISMATCH', 'VALUE_MISMATCH', 'PREDICATE_MISMATCH', 'POLICY_DENIED'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const jsonLines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }) : []);
const lastPerKey = (rows) => { const map = new Map(); for (const row of rows) map.set(row.key, row); return map; };

// verbatim from the harness (run.mjs normalizedBodyHash): used only to confirm that a body belongs to a row
function normalizedBodyHash(body) {
  const drop = new Set(['requestId', 'documentId', 'observationHash', 'observedAt', 'authoredInputsHash', 'inputId']);
  const randomIds = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if ((key === 'documentId' || key === 'inputId') && typeof item === 'string') randomIds.add(item); else collect(item); }
  };
  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !drop.has(key)).map(([key, item]) => [key, scrub(item)]));
    return value;
  };
  let envelope = null;
  try { const parsed = JSON.parse(body.contents[0].parts[0].text); collect(parsed); envelope = scrub(parsed); } catch { envelope = null; }
  const rest = scrub({ ...body, contents: body.contents.map((content, index) => (index === 0 ? { ...content, parts: content.parts.slice(1) } : content)) });
  let text = JSON.stringify({ envelope, rest });
  for (const id of randomIds) text = text.split(id).join('<random-id>');
  return sha256(text);
}

function plansOf(runDir) {
  const map = new Map();
  const dir = join(runDir, 'plans');
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir).sort()) {
    let plan;
    try { plan = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { continue; }
    const admitted = plan.admitted;
    if (!admitted) continue;
    for (const obligation of admitted.obligations ?? []) map.set(obligation.obligationId, { sourceReferences: admitted.sourceReferences ?? [], obligations: admitted.obligations, needs: admitted.needs ?? [] });
  }
  return map;
}

// ---- the outline, parsed (lines of `- role "name" [ref] {state} {placeholder="…"} {near="…"} …`)
const LINE = /^(\s*)- (\S+)(?: ("(?:[^"\\]|\\.)*"))?(?: \[(e\d+)\])?(.*)$/u;
const attr = (rest, key) => { const m = new RegExp(`\\{${key}=("(?:[^"\\\\]|\\\\.)*")\\}`, 'u').exec(rest); return m ? JSON.parse(m[1]) : undefined; };
function parseLines(outline) {
  const nodes = [];
  outline.split('\n').forEach((raw) => {
    const m = LINE.exec(raw);
    if (!m) return;
    const [, pad, role, quoted, ref, rest] = m;
    const states = (/^\s*\{([^}]*)\}/u.exec(rest)?.[1] ?? '').split(',').filter(Boolean);
    nodes.push({ depth: pad.length / 2, role, name: quoted ? JSON.parse(quoted) : '', ref: ref ?? null, rest, placeholder: attr(rest, 'placeholder'), near: attr(rest, 'near'), states, withheld: /\{value withheld\}/u.test(rest), kids: [], parent: -1 });
  });
  const stack = [];
  nodes.forEach((n, i) => {
    while (stack.length && nodes[stack.at(-1)].depth >= n.depth) stack.pop();
    n.parent = stack.length ? stack.at(-1) : -1;
    if (n.parent >= 0) nodes[n.parent].kids.push(i);
    stack.push(i);
  });
  return nodes;
}
const isTruncated = (text) => typeof text === 'string' && Array.from(text).length >= 160 && text.endsWith('…');

/** The node the harness gates saw, rebuilt from the outline line and the lines around it. */
function rebuildNode(nodes, index) {
  const n = nodes[index];
  if (n.role === 'text') return { kind: 'text', text: n.name };
  const textKids = n.kids.map((k) => nodes[k]).filter((k) => k.role === 'text').map((k) => k.name);
  let groupName;
  for (let p = n.parent; p >= 0; p = nodes[p].parent) {
    const ancestor = nodes[p];
    if (['radiogroup', 'group', 'listbox', 'menu'].includes(ancestor.role) && ancestor.name) { groupName = spike.bound(ancestor.name, 80); break; }
  }
  let headers;
  if (n.role === 'cell' || n.role === 'gridcell') {
    const row = n.parent >= 0 && nodes[n.parent].role === 'row' ? nodes[n.parent] : null;
    const found = [];
    if (row) for (const k of row.kids) if (nodes[k].role === 'rowheader' && nodes[k].name) found.push(nodes[k].name);
    if (found.length) headers = found;
  }
  const node = { kind: 'node', role: n.role, rawName: n.name, ownText: spike.bound(textKids.join(' '), 256), states: n.states };
  if (n.placeholder !== undefined) node.placeholder = n.placeholder;
  if (n.near !== undefined) node.near = n.near;
  if (groupName !== undefined) node.groupName = groupName;
  if (headers !== undefined) node.headers = headers;
  return node;
}

/** The text of a node the way facts.text composes it: the node's printed name and the printed names / texts below it, collapsed. */
function factsTextOf(nodes, index) {
  const parts = [];
  const hiddenBelow = (i) => nodes[i].kids.some((k) => nodes[k].withheld || nodes[k].role === 'passwordControl' || nodes[k].role === 'withheld' || /\{unsupported surface\}/u.test(nodes[k].rest) || hiddenBelow(k));
  const walk = (i) => { for (const k of nodes[i].kids) { if (nodes[k].name) parts.push(nodes[k].name); walk(k); } };
  const n = nodes[index];
  const hidden = n.withheld || hiddenBelow(index);
  if (n.name) parts.push(n.name);
  walk(index);
  const joined = parts.join(' ').replace(/\s+/gu, ' ').trim();
  return { hidden, text: spike.bound(joined, 256), truncated: parts.some((p) => isTruncated(p)) };
}

function resolveLiteral(ctx, plan, value) {
  if (!value || value.kind !== 'authoredLiteral') return null;
  const index = (ctx.inputs ?? []).findIndex((input) => input.inputId === value.sourceInputId);
  if (index < 0 || !plan) return null;
  const used = [];
  for (const obligation of plan.obligations) { const r = obligation.referenceIndex; if (r != null && plan.sourceReferences[r] && !used.includes(r)) used.push(r); }
  const reference = plan.sourceReferences[used[index]];
  if (!reference) return null;
  const step = ctx.sourceSteps.find((s) => s.stepId === reference.stepId);
  return step ? step.text.slice(reference.startUtf16, reference.endUtf16) : null;
}

export function extract() {
  const out = { schemaVersion: 1, provenance: null, plans: {}, rows: [], unlinked: [] };
  const sources = {};
  for (const run of RUNS) {
    const dir = join(RUNS_DIR, run);
    for (const file of ['steps.jsonl', 'replies.jsonl', 'calls.jsonl']) sources[`${run}/${file}`] = sha256(readFileSync(join(dir, file)));
    const steps = lastPerKey(jsonLines(join(dir, 'steps.jsonl')));
    const replies = lastPerKey(jsonLines(join(dir, 'replies.jsonl')));
    const calls = new Map();
    for (const call of jsonLines(join(dir, 'calls.jsonl'))) if (call.status === 200) { if (!calls.has(call.label)) calls.set(call.label, []); calls.get(call.label).push(call.n); }
    const plans = plansOf(dir);
    for (const [key, row] of steps) {
      if (row.arm !== 'S3') continue;
      const reply = replies.get(key)?.reply;
      if (!reply || reply.status !== 'ACTION') continue;
      let body = null;
      for (const n of (calls.get(key) ?? []).slice().reverse()) {
        const candidate = JSON.parse(readFileSync(join(dir, 'bodies', `${n}.json`), 'utf8'));
        if (normalizedBodyHash(candidate) === row.bodyHash) { body = candidate; break; }
      }
      if (!body) { out.unlinked.push(key); continue; }
      const ctx = JSON.parse(body.contents[0].parts[0].text).context;
      const obligation = ctx.obligations.find((o) => o.obligationId === reply.obligationId);
      const plan = plans.get(reply.obligationId);
      const operation = reply.action?.operation ?? null;
      const target = reply.action?.target ?? null;
      const outline = typeof ctx.observation === 'string' ? ctx.observation : '';
      const nodes = parseLines(outline);
      const pickedIndex = target?.kind === 'node' ? nodes.findIndex((n) => n.ref === target.ref) : -1;
      const targetIsNode = target?.kind === 'node' && pickedIndex >= 0;
      const node = targetIsNode ? rebuildNode(nodes, pickedIndex) : null;
      const picked = targetIsNode ? nodes[pickedIndex] : null;
      const nearby = picked ? [picked.name, picked.near, picked.placeholder, ...picked.kids.map((k) => nodes[k]).filter((k) => k.role === 'text').map((k) => k.name)] : [];
      const factsText = targetIsNode ? factsTextOf(nodes, pickedIndex) : null;
      const features = {
        hasTail: TAIL_LINE.test(outline), targetIsNode, role: picked?.role ?? null, operationKind: operation?.kind ?? null, predicate: operation?.predicate ?? null,
        truncatedQuote: nearby.some(isTruncated) || (factsText?.truncated ?? false),
      };
      const klass = classifyRow(features);
      const recorded = row.gateCodes ?? [];
      const record = {
        key, run, task: row.task, class: klass.class, partial: klass.partial, features,
        category: row.confidentWrong === true ? 'confidentWrong' : row.correctAndExecutable === true ? 'correct' : 'other',
      };
      if (klass.applies.intent && node) {
        record.intent = { targetIntent: obligation?.targetIntent ?? null, node, facts: { name: node.rawName ?? '', evidence: spike.evidenceFor(node) }, recorded: recorded.find((c) => c.startsWith('INTENT_')) ?? null, spike: spike.intentGate(obligation?.targetIntent, node) };
      }
      if (klass.applies.operation && picked) {
        const opNode = { kind: 'node', role: picked.role, states: picked.states };
        record.operation = { kind: operation?.kind ?? null, node: opNode, recorded: recorded.includes('OPERATION_TARGET_MISMATCH') ? 'OPERATION_TARGET_MISMATCH' : null, spike: spike.operationTargetGate(operation?.kind, opNode) };
      }
      if (obligation && plan) {
        const input = { reply, obligation, plan, inputs: ctx.inputs ?? [] };
        const planId = sha256(JSON.stringify(plan)).slice(0, 16);
        out.plans[planId] = plan;
        record.action = { planId, reply, obligation, inputs: input.inputs, recorded: recorded.filter((c) => ACTION_CODES.includes(c)), spike: spike.actionGate(input) };
      } else record.action = null;
      if (klass.applies.g2 && factsText) {
        const literal = resolveLiteral(ctx, plan, operation?.expected);
        if (literal !== null) {
          const parsed = spike.parseOutline(outline);
          const targetNode = parsed.byRef.get(target.ref);
          const offline = spike.g2(parsed, targetNode, literal);
          record.g2 = {
            literal, role: picked.role, facts: factsText.hidden ? { text: null } : { text: factsText.text }, truncated: factsText.truncated,
            spike: { applies: offline.applies, reason: offline.reason ?? null, refuse: offline.refuse ?? null, refuseCI: offline.refuseCI ?? null },
          };
        }
      }
      out.rows.push(record);
    }
  }
  out.provenance = {
    runs: RUNS, sourceFileSha256: sources, classificationSha256: sha256(readFileSync(join(here, 'classification.mjs'))),
    spikeCopySha256: sha256(readFileSync(join(here, '..', 'spike-pure', 'spike-pure.cjs'))), arm: 'S3', rowsExtracted: out.rows.length, unlinkedRows: out.unlinked.length,
    note: 'Gate inputs are rebuilt from the recorded outline; recorded = steps.jsonl gateCodes; spike = the verbatim spike gate functions on the rebuilt inputs.',
  };
  return out;
}

/** The human-readable AC6 report: counts, the agreement on EXACT rows, and every PARTIAL row with the input it lacks. */
export function report(data) {
  const rows = data.rows;
  const lines = [];
  const count = (predicate) => rows.filter(predicate).length;
  const agree = (row, gate) => (row[gate] ? JSON.stringify(row[gate].recorded) === JSON.stringify(row[gate].spike) : null);
  lines.push('# S3 gate vectors: classification and agreement (generated, do not edit)', '');
  lines.push('Generated by `extract-gate-vectors.mjs` from the recorded runs `s3v2-20261027` and `wave2-20261027`. See `classification.mjs` for the rule, fixed before any verdict was compared.', '');
  lines.push('| run | rows | EXACT | PARTIAL |', '|---|---|---|---|');
  for (const run of data.provenance.runs) lines.push(`| ${run} | ${String(count((r) => r.run === run))} | ${String(count((r) => r.run === run && r.class === 'EXACT'))} | ${String(count((r) => r.run === run && r.class === 'PARTIAL'))} |`);
  lines.push('', '## Recorded harness verdict versus the spike gate function on the rebuilt inputs', '');
  lines.push('| gate | EXACT rows evaluated | EXACT rows that differ | PARTIAL rows evaluated | PARTIAL rows that differ |', '|---|---|---|---|---|');
  for (const gate of ['intent', 'operation', 'action']) {
    const exact = rows.filter((r) => r.class === 'EXACT' && r[gate]);
    const partial = rows.filter((r) => r.class === 'PARTIAL' && r[gate]);
    lines.push(`| ${gate} | ${String(exact.length)} | ${String(exact.filter((r) => !agree(r, gate)).length)} | ${String(partial.length)} | ${String(partial.filter((r) => !agree(r, gate)).length)} |`);
  }
  const g2 = rows.filter((r) => r.g2);
  lines.push('', `G2 (offline, regate-v3 definition) was evaluated on ${String(g2.length)} rows; it has no per-row recorded code. By category, rows refused (case-insensitive): ` +
    ['confidentWrong', 'correct', 'other'].map((c) => `${c} ${String(g2.filter((r) => r.category === c && r.g2.spike.refuseCI === true).length)}/${String(g2.filter((r) => r.category === c).length)}`).join(', ') + '.', '');
  lines.push('## PARTIAL rows and the input each lacks', '', '| key | gates and lacking input |', '|---|---|');
  for (const row of rows.filter((r) => r.class === 'PARTIAL')) lines.push(`| ${row.key.replaceAll('|', '\\|')} | ${row.partial.map((p) => `${p.gate}: ${p.transform} ${p.lacks}`).join('; ')} |`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = extract();
  const text = `${JSON.stringify(data)}\n`;
  const reportText = report(data);
  const target = join(here, 's3-gate-vectors.json');
  const reportTarget = join(here, 'PARTIAL-ROWS.md');
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text || readFileSync(reportTarget, 'utf8') !== reportText) { console.error('the gate vector fixture differs from a fresh extraction'); process.exitCode = 1; } else console.log('the gate vector fixture is current');
  } else {
    writeFileSync(target, text);
    writeFileSync(reportTarget, reportText);
    console.log(`wrote ${target} (${String(text.length)} bytes) and ${reportTarget}`);
  }
}
