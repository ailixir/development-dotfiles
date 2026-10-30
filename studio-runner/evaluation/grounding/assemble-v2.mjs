/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, Node globals. */
// SPK-07 post-hoc "S3 v2" report assembler (screening evidence, not ADR-SC-005 D-C evidence).
//
//   node evaluation/grounding/assemble-v2.mjs --out runs/final-s3v2-20261027 [--fresh-only]
//        [--base runs/final-20261026] [--s3v2 runs/s3v2-20261027] [--wave2 runs/wave2-20261027] [--corpus corpus/tasks.jsonl]
//
// Relative paths resolve against the harness root (the directory of this file), so the command works from studio-runner/.
// Output rows =
//   base (wave 1) rows for A0, A1, S1, S2 (and the shared SOURCE_PLAN rows) EXCEPT task neg-gov-02
// + S3 rows from the s3v2 run for wave-1 tasks EXCEPT neg-gov-02
// + every row of the wave2 run except S4 (all arms A0-S3 on the wave-2 tasks, plus the rewritten neg-gov-02).
// Every S4 row and every wave-1 S3 row of the base is dropped. --fresh-only keeps only the wave-2 tasks of the wave2 run.
// Copy-only: a source dir is never modified, and an existing --out is refused.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const REWRITTEN_TASK = 'neg-gov-02';
export const BASE_ARMS = new Set(['A0', 'A1', 'S1', 'S2']);
const WAVE2_EXCLUDED_ARMS = new Set(['S4']);
/** `SP` = the shared SOURCE_PLAN rows (key arm). */
const SHARED_ARM = 'SP';
const KEYED_FILES = ['steps.jsonl', 'void.jsonl', 'scoring-input.jsonl', 'scoring-output.jsonl', 'loads.jsonl', 'replies.jsonl'];
const NOTE = 'post-hoc S3 v2: wave-1 A0/A1/S1/S2 from base, S3 re-run on wave-1 tasks, all arms (no S4) on wave-2 tasks; neg-gov-02 taken from the wave-2 run only; safety.json/leakscan.json are from the s3v2 run';

export function parseArgs(argv) {
  const args = { out: null, base: 'runs/final-20261026', s3v2: 'runs/s3v2-20261027', wave2: 'runs/wave2-20261027', corpus: 'corpus/tasks.jsonl', freshOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { const value = argv[++i]; if (value === undefined) throw new Error(`MISSING_VALUE ${arg}`); return value; };
    if (arg === '--out') args.out = next();
    else if (arg === '--base') args.base = next();
    else if (arg === '--s3v2') args.s3v2 = next();
    else if (arg === '--wave2') args.wave2 = next();
    else if (arg === '--corpus') args.corpus = next();
    else if (arg === '--fresh-only') args.freshOnly = true;
    else throw new Error(`UNKNOWN_ARGUMENT ${arg}`);
  }
  if (!args.out) throw new Error('OUT_REQUIRED');
  return args;
}

const parseLine = line => { try { return JSON.parse(line); } catch { return null; } };
/** Raw lines of a jsonl file that parse, with their parsed row; unparsable (torn) lines are counted, not copied. */
function readRows(file) {
  if (!existsSync(file)) return { rows: [], torn: 0 };
  const rows = [];
  let torn = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = parseLine(line);
    if (row === null || typeof row !== 'object') torn++; else rows.push({ line, row });
  }
  return { rows, torn };
}
const taskOf = row => row.task ?? String(row.key ?? '').split('|')[0];
/** Arm of a row; undefined for files that carry none (loads, void). */
const armOf = row => row.arm ?? (typeof row.key === 'string' ? row.key.split('|')[2] : undefined);
const planTask = name => (/^(.*)\.\d+\.json$/u.exec(name)?.[1] ?? name.split('.')[0]);

export function assemble({ out, base, s3v2, wave2, corpus, freshOnly = false }) {
  const R = path => resolve(ROOT, path);
  const dirs = { base: R(base), s3v2: R(s3v2), wave2: R(wave2) };
  const OUT = R(out);
  for (const [name, dir] of Object.entries(dirs)) {
    if (name === 'base' && freshOnly) continue;
    if (name === 's3v2' && freshOnly) continue;
    if (!existsSync(dir)) throw new Error(`SOURCE_MISSING ${name}: ${dir}`);
  }
  if (existsSync(OUT)) throw new Error(`OUT_EXISTS ${OUT}`);
  for (const dir of Object.values(dirs)) if (OUT === dir || OUT.startsWith(`${dir}/`) || dir.startsWith(`${OUT}/`)) throw new Error(`OUT_OVERLAPS_SOURCE ${dir}`);

  const corpusRows = readRows(R(corpus)).rows.map(item => item.row);
  const waveOf = task => (task.wave ?? 1);
  const wave2Tasks = corpusRows.filter(task => waveOf(task) === 2);
  const wave1Tasks = corpusRows.filter(task => waveOf(task) !== 2);
  const planned = freshOnly ? wave2Tasks : [...wave1Tasks, ...wave2Tasks];
  const wave2Ids = new Set(wave2Tasks.map(task => task.id));

  // Per-source row filters (source name -> predicate on the parsed row).
  const keepBase = row => taskOf(row) !== REWRITTEN_TASK && (armOf(row) === undefined || armOf(row) === SHARED_ARM || BASE_ARMS.has(armOf(row)));
  const keepS3 = row => taskOf(row) !== REWRITTEN_TASK && (armOf(row) === undefined || armOf(row) === 'S3');
  const keepWave2 = row => !WAVE2_EXCLUDED_ARMS.has(armOf(row)) && (!freshOnly || wave2Ids.has(taskOf(row)));
  const sources = freshOnly ? [['wave2', keepWave2]] : [['base', keepBase], ['s3v2', keepS3], ['wave2', keepWave2]];

  const lines = {};
  const counts = {};
  let torn = 0;
  for (const name of KEYED_FILES) {
    lines[name] = [];
    counts[name] = {};
    for (const [source, keep] of sources) {
      const { rows, torn: tornHere } = readRows(join(dirs[source], name));
      torn += tornHere;
      const kept = rows.filter(item => keep(item.row)).map(item => item.line);
      lines[name].push(...kept);
      counts[name][source] = kept.length;
    }
  }

  // Plans: base plans except the rewritten task, plus every wave-2 plan. A name present in both is a conflict.
  const planCopies = new Map();
  const planSources = freshOnly ? [['wave2', () => true]] : [['base', name => planTask(name) !== REWRITTEN_TASK], ['wave2', () => true]];
  for (const [source, keep] of planSources) {
    const dir = join(dirs[source], 'plans');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!keep(name)) continue;
      if (planCopies.has(name)) throw new Error(`PLAN_CONFLICT ${name} (in base and wave2)`);
      planCopies.set(name, join(dir, name));
    }
  }
  if (freshOnly) for (const name of [...planCopies.keys()]) if (!wave2Ids.has(planTask(name))) planCopies.delete(name);

  const baseRun = freshOnly ? JSON.parse(readFileSync(join(dirs.wave2, 'run.json'), 'utf8')) : JSON.parse(readFileSync(join(dirs.base, 'run.json'), 'utf8'));
  const armIds = [...new Set([...(baseRun.arms ?? ['A0', 'A1', 'S1', 'S2', 'S3']).filter(arm => arm !== 'S4'), 'S3'])];
  const repsByArm = baseRun.repsByArm ? Object.fromEntries(Object.entries(baseRun.repsByArm).filter(([arm]) => arm !== 'S4')) : undefined;
  const run = { ...baseRun, runId: basename(OUT), postHoc: true, arms: armIds, ...(repsByArm ? { repsByArm } : {}),
    assembledFrom: { base: freshOnly ? null : basename(dirs.base), s3v2: freshOnly ? null : basename(dirs.s3v2), wave2: basename(dirs.wave2), freshOnly, note: NOTE },
    plannedTasks: planned.map(task => ({ id: task.id, stratum: task.stratum, site: task.site ?? null, steps: task.steps.length })) };

  // All reads and checks done: write.
  mkdirSync(join(OUT, 'plans'), { recursive: true });
  for (const name of KEYED_FILES) writeFileSync(join(OUT, name), lines[name].length ? `${lines[name].join('\n')}\n` : '');
  for (const [name, file] of planCopies) cpSync(file, join(OUT, 'plans', name));
  const safetyFrom = [];
  for (const name of ['safety.json', 'leakscan.json']) if (existsSync(join(dirs.s3v2, name))) { cpSync(join(dirs.s3v2, name), join(OUT, name)); safetyFrom.push(name); }
  writeFileSync(join(OUT, 'run.json'), JSON.stringify(run, null, 1));
  return { out: OUT, freshOnly, counts, plans: planCopies.size, plannedTasks: planned.length, wave2Tasks: wave2Tasks.length, copiedFromS3v2: safetyFrom, tornLinesSkipped: torn };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(JSON.stringify(assemble(parseArgs(process.argv.slice(2)))));
  } catch (error) {
    console.error(String(error.message));
    process.exitCode = 1;
  }
}
