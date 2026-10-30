// Pure offline gates G1 / G2 over a recorded S3 outline. No harness code is modified; nothing here talks to a model.
const QUOTED = '"(?:[^"\\\\]|\\\\.)*"';
const LINE = new RegExp(`^(\\s*)- (\\S+)(?: (${QUOTED}))?(?: \\[(e\\d+)\\])?(.*)$`, 'u');
const MORE_OPTIONS = /^(\s*)… (\d+) more options\s*$/u;
const MORE_NODES = /^… (\d+) more nodes not shown\s*$/u;

export function parseOutline(outline) {
  const lines = outline.split('\n');
  const nodes = [];
  let moreNodes = 0;
  lines.forEach((raw, idx) => {
    let m = MORE_OPTIONS.exec(raw);
    if (m) { nodes.push({ idx, kind: 'moreOptions', depth: m[1].length / 2, count: Number(m[2]) }); return; }
    m = MORE_NODES.exec(raw);
    if (m) { moreNodes = Number(m[1]); nodes.push({ idx, kind: 'moreNodes', depth: -1, count: moreNodes }); return; }
    m = LINE.exec(raw);
    if (!m) { nodes.push({ idx, kind: 'unparsed', depth: -1, raw }); return; }
    const [, pad, role, q, ref, restRaw] = m;
    const rest = restRaw.replace(new RegExp(QUOTED, 'gu'), '""');
    let name = null;
    if (q) { try { name = JSON.parse(q); } catch { name = q.slice(1, -1); } }
    nodes.push({
      idx, kind: 'line', depth: pad.length / 2, role, name, ref: ref ?? null,
      withheldValue: /\{value withheld\}/u.test(rest),
      hiddenSurface: role === 'passwordControl' || role === 'withheld' || /\{unsupported surface\}/u.test(rest),
      selected: /\{[^}]*\bselected\b[^}]*\}/u.test(rest),
    });
  });
  const byRef = new Map();
  nodes.forEach((n, i) => { n.i = i; if (n.ref) byRef.set(n.ref, n); });
  return { nodes, byRef, moreNodes };
}

/** Lines strictly inside the subtree of node n (by indentation), including `… N more options` lines. */
export function subtree(parsed, n) {
  const out = [];
  for (let i = n.i + 1; i < parsed.nodes.length; i++) {
    const c = parsed.nodes[i];
    if (c.kind === 'moreNodes' || c.kind === 'unparsed') break;
    if (c.depth <= n.depth) break;
    out.push(c);
  }
  return out;
}

const trim = s => String(s).trim();

/** G1 OPTION_NOT_PRESENT. Returns {applies, reason?, refuse?, refuseCI?, options?}. */
export function g1(parsed, target, literal, { requireOptions = true } = {}) {
  if (!target) return { applies: false, reason: 'TARGET_NOT_IN_OUTLINE' };
  if (!['combobox', 'listbox'].includes(target.role)) return { applies: false, reason: `ROLE_${target.role}` };
  const kids = subtree(parsed, target);
  if (kids.some(k => k.kind === 'moreOptions')) return { applies: false, reason: 'MORE_OPTIONS_LINE' };
  const options = kids.filter(k => k.kind === 'line' && k.role === 'option').map(k => k.name ?? '');
  if (options.length === 0 && requireOptions) return { applies: false, reason: 'NO_OPTION_LINES' };
  const lit = trim(literal);
  const exact = options.some(o => trim(o) === lit);
  const ci = options.some(o => trim(o).toLowerCase() === lit.toLowerCase());
  return { applies: true, refuse: !exact, refuseCI: !ci, options: options.length, nearMiss: !exact && ci, targetName: target.name, optionNames: options.slice(0, 14) };
}

const collapse = s => String(s).replace(/\s+/gu, ' ').trim();
/** G2 ASSERT_TEXT_ABSENT. */
export function g2(parsed, target, literal) {
  if (!target) return { applies: false, reason: 'TARGET_NOT_IN_OUTLINE' };
  const kids = subtree(parsed, target);
  const hidden = target.withheldValue || target.hiddenSurface || kids.some(k => k.kind === 'line' && (k.withheldValue || k.hiddenSurface));
  if (hidden) return { applies: false, reason: target.withheldValue ? 'TARGET_WITHHELD' : 'DESCENDANT_WITHHELD' };
  const texts = [target.name, ...kids.filter(k => k.kind === 'line').map(k => k.name)].filter(t => t != null && t !== '');
  const hay = collapse(texts.join(' '));
  const lit = collapse(literal);
  const truncated = texts.some(t => /…$/u.test(t) && Array.from(t).length >= 160);
  return { applies: true, refuse: !hay.includes(lit), refuseCI: !hay.toLowerCase().includes(lit.toLowerCase()), truncated, textLen: hay.length, descendants: kids.length, targetName: target.name, hay: hay.slice(0, 160) };
}
