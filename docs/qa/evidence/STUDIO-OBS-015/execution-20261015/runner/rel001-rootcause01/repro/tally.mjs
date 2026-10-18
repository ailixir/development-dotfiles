#!/usr/bin/env node
// REL-001 repro: tally harness and probe results.
//   tally.mjs <file.jsonl>...            per-mode table of failures by hypothesis, timings, probe summary
//   tally.mjs --compare <dirA> <dirB>    Fisher exact test per mode (failures in A vs B)
// Pure reader. Classification keys on the GUIDED_START_FAILED facts, never on message text.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const lines = f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const fmt = v => v === null || v === undefined ? '-' : (Number.isInteger(v) ? String(v) : v.toFixed(1));
const lf = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
const hyper = (a, b, c, d) => Math.exp(lf(a + b) + lf(c + d) + lf(a + c) + lf(b + d) - lf(a + b + c + d) - lf(a) - lf(b) - lf(c) - lf(d));
function fisher(a, b, c, d) { const p0 = hyper(a, b, c, d); let p = 0; const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const q = hyper(x, r1 - x, c1 - x, r2 - c1 + x); if (q <= p0 * (1 + 1e-9)) p += q; } return Math.min(1, p); }
function upper95(k, n) { if (n === 0) return null; if (k === 0) return 1 - Math.pow(0.05, 1 / n);
  const z = 1.96, ph = k / n, den = 1 + z * z / n; return (ph + z * z / (2 * n) + z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / den; }

// Hypothesis classes (see runbook.md section 6).
export function classify(rec) {
  if (rec.ok) return null;
  if (rec.hang) return 'D4 hang (start did not finish in time)' + (rec.hangFacts?.phase ? ` at ${rec.hangFacts.phase}` : '');
  const links = rec.facts?.links ?? [];
  if (!links.length) return 'UNCLASSIFIED (no facts)';
  const top = links[0], inner = links.at(-1), launch = links.find(l => l.name === 'GuidedLaunchFailure');
  const loss = links.map(l => l.loss).find(Boolean);
  const lp = launch?.phase ?? null;
  if (lp === 'PROBE' && (inner.code === 'PROFILE_PREFERENCES_REQUIRED' || inner.code === 'PROFILE_MISMATCH')) return 'H1 version probe read empty/mismatched fields';
  if (lp === 'PROBE' && inner.kind === 'TIMEOUT') return 'H1b probe wait timed out (page never filled the fields)';
  if (inner.kind === 'TARGET_CLOSED' || inner.signal || (inner.exitCode !== undefined && inner.exitCode !== null)) return `H3 browser exited/closed${inner.signal ? ' ' + inner.signal : ''} during ${lp ?? top.phase}`;
  if (lp === 'PROCESS') return 'H3b browser process launch error (not an exit)';
  if (loss) return `H2/H3 browser reported lost: ${loss}`;
  if (['STARTUP_PAGE', 'APP_PAGE', 'ROUTING', 'BLANK_DOCUMENT', 'PROFILE'].includes(lp)) return `H2 in-launch step ${lp}${inner.code ? ' ' + inner.code : ''}`;
  if (lp === 'PROBE') return `H2 probe step failed${inner.code ? ' ' + inner.code : ''}`;
  if (['WITHHOLD', 'BLANK_MATCH', 'BOOTSTRAP_CALLBACK'].includes(top.phase) || inner.code === 'CALLBACK_DENIED') return `H4 post-launch step ${top.phase}${inner.code ? ' ' + inner.code : ''}`;
  if (links.some(l => l.code === 'LEASE_LOST') || top.phase === 'STARTED') return 'H5 lease/ownership after start';
  return `UNCLASSIFIED ${top.phase ?? ''}/${lp ?? ''}/${inner.code ?? inner.kind ?? ''}`;
}

function summarize(file) {
  const rows = lines(file), meta = rows.filter(r => r.meta), its = rows.filter(r => !r.meta);
  const fails = its.filter(r => !r.ok), oks = its.filter(r => r.ok);
  const by = new Map(); for (const f of fails) { const k = classify(f); by.set(k, (by.get(k) ?? 0) + 1); }
  const start = meta.find(m => m.event === 'start'), end = meta.find(m => m.event === 'end');
  return { file, mode: start?.mode ?? basename(file), variant: start?.variant, n: its.length, ok: oks.length, fail: fails.length, by, start, end,
    t: k => ({ ok: oks.map(r => r[k]).filter(Number.isFinite), fail: fails.map(r => r[k]).filter(Number.isFinite) }),
    closeBad: its.filter(r => r.close && r.close !== 'ok').length, lineSamples: fails.slice(0, 3).map(f => f.line) };
}

function probeSummary(file) {
  const its = lines(file).filter(r => !r.meta); const ok = its.filter(r => r.ok);
  const empty = ok.filter(r => r.emptyAtRead).length, never = ok.filter(r => r.neverFilled).length;
  const fill = ok.map(r => r.fillAfterLoadMs).filter(Number.isFinite), wait = ok.map(r => r.waitMs).filter(Number.isFinite);
  return { file, n: its.length, launchFailed: its.length - ok.length, empty, never, obs: fill.length, fillP50: pct(fill, 50), fillP95: pct(fill, 95), fillMax: pct(fill, 100), positive: fill.filter(x => x > 0).length, waitP95: pct(wait, 95), waitMax: pct(wait, 100) };
}

const argv = process.argv.slice(2);
if (argv[0] === '--compare') {
  const [da, db] = argv.slice(1); const pick = d => Object.fromEntries(readdirSync(d).filter(f => f.endsWith('.jsonl') && !f.endsWith('.raw.jsonl') && !f.endsWith('.probe.jsonl')).map(f => { const s = summarize(join(d, f)); return [s.mode, s]; }));
  const A = pick(da), B = pick(db); console.log('mode            A fail/n      B fail/n      Fisher p (two-sided)');
  for (const m of Object.keys(A)) if (B[m]) { const a = A[m], b = B[m]; console.log(`${m.padEnd(15)} ${`${a.fail}/${a.n}`.padEnd(13)} ${`${b.fail}/${b.n}`.padEnd(13)} ${fisher(a.fail, a.n - a.fail, b.fail, b.n - b.fail).toExponential(2)}`); }
  process.exit(0);
}
const files = argv.filter(f => existsSync(f) && !f.endsWith('.raw.jsonl'));
for (const f of files.filter(f => !f.endsWith('.probe.jsonl'))) {
  const s = summarize(f); const r = s.n ? s.fail / s.n : 0;
  console.log(`\n== ${s.mode} (variant ${s.variant ?? '?'}) ==  n=${s.n} ok=${s.ok} failed=${s.fail} (${(100 * r).toFixed(2)}%, 95% upper bound ${(100 * (upper95(s.fail, s.n) ?? 0)).toFixed(2)}%)  close!=ok: ${s.closeBad}`);
  if (s.start) console.log(`   window: ${new Date(s.start.startEpochMs).toISOString()} .. ${s.end ? new Date(s.end.endEpochMs).toISOString() : '(no end marker: run was interrupted)'}  node ${s.start.node}  playwright ${s.start.playwright}`);
  for (const [k, v] of [...s.by.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
  for (const key of ['launchMs', 'contextMs', 'bootstrapMs', 'recordingReadyMs']) { const t = s.t(key); console.log(`   ${key.padEnd(17)} ok p50/p95/max ${fmt(pct(t.ok, 50))}/${fmt(pct(t.ok, 95))}/${fmt(pct(t.ok, 100))} ms${t.fail.length ? `   failed p50/max ${fmt(pct(t.fail, 50))}/${fmt(pct(t.fail, 100))}` : ''}`); }
  for (const l of s.lineSamples) console.log('   e.g. ' + l.slice(0, 400));
}
for (const f of files.filter(f => f.endsWith('.probe.jsonl'))) {
  const p = probeSummary(f);
  console.log(`\n== version probe ${basename(f)} ==  n=${p.n} launchFailed=${p.launchFailed}  EMPTY at pre-patch read: ${p.empty}/${p.n - p.launchFailed}  never filled: ${p.never}`);
  console.log(`   fill relative to load (ms; positive = after load): observed ${p.obs}, positive ${p.positive}, p50 ${fmt(p.fillP50)}, p95 ${fmt(p.fillP95)}, max ${fmt(p.fillMax)}   wait after goto p95/max ${fmt(p.waitP95)}/${fmt(p.waitMax)} ms`);
}
