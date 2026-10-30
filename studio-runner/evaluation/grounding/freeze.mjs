/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, dynamic imports of arm modules, Node globals. */
// SPK-07 freeze: pins the corpus bytes, the contract files, the harness file list and the Playwright bundle before any
// S-arm model call. run.mjs refuses S-arm model calls unless verifyFreeze() is ok. Screening evidence only.
// usage: node evaluation/grounding/freeze.mjs [--force]
//   writes evaluation/grounding/corpus/freeze.json and docs/qa/spikes/SPK-07/freeze.json
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GROUNDING_ROOT = dirname(fileURLToPath(import.meta.url));
export const FREEZE_VERSION = 1;
export const STRATA = ['uniqueNav', 'menuNameDiffers', 'labeledField', 'visualOnlyField', 'duplicateNeedsContext', 'iconOnly', 'selectCheck',
  'readTarget', 'assertTarget', 'random', 'negative', 'chain', 'fixtureRegression'];
const HARNESS_EXCLUDED_DIRS = new Set(['runs', 'corpus', 'contracts', 'node_modules', '.git']);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = items => [...items].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const combine = files => sha256(sorted(Object.keys(files)).map(path => `${path}\0${files[path]}\n`).join(''));

function listFiles(dir, { excludedDirs = new Set() } = {}) {
  if (!existsSync(dir)) return [];
  const out = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) { if (!excludedDirs.has(entry.name)) visit(path); } else if (entry.isFile()) out.push(path);
    }
  };
  visit(dir);
  return sorted(out);
}

function hashFiles(root, files) {
  const hashes = {};
  for (const path of files) hashes[relative(root, path)] = sha256(readFileSync(path));
  return hashes;
}

export function playwrightPin() {
  const require = createRequire(new URL('../../package.json', import.meta.url));
  const dir = dirname(require.resolve('playwright-core/package.json'));
  return { version: require('playwright-core/package.json').version, bundleSha256: sha256(readFileSync(join(dir, 'lib', 'coreBundle.js'))) };
}

export function paths(root = GROUNDING_ROOT, docsDir = join(root, '..', '..', '..', 'docs', 'qa', 'spikes', 'SPK-07'),
  productionContract = join(root, 'contracts', 'frozen-production', 'guided-output-contract.md')) {
  return { productionContract, root, corpus: join(root, 'corpus', 'tasks.jsonl'), freeze: join(root, 'corpus', 'freeze.json'), contracts: join(root, 'contracts'),
    docsDir, docsFreeze: join(docsDir, 'freeze.json') };
}

/** Counts per stratum and a structural check of the corpus (unique ids, known strata). */
export function corpusCounts(bytes) {
  const tasks = [];
  bytes.toString('utf8').split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try { tasks.push(JSON.parse(line)); } catch { throw new Error(`CORPUS_LINE_INVALID ${index + 1}`); }
  });
  const ids = new Set();
  const byStratum = {};
  const byExpect = {};
  const sites = new Set();
  let heldOut = 0;
  for (const task of tasks) {
    if (typeof task.id !== 'string' || ids.has(task.id)) throw new Error(`CORPUS_DUPLICATE_OR_MISSING_ID ${String(task.id)}`);
    ids.add(task.id);
    if (!STRATA.includes(task.stratum)) throw new Error(`CORPUS_UNKNOWN_STRATUM ${task.id} ${String(task.stratum)}`);
    byStratum[task.stratum] = (byStratum[task.stratum] ?? 0) + 1;
    byExpect[task.expect] = (byExpect[task.expect] ?? 0) + 1;
    sites.add(task.site);
    if (task.heldOut) heldOut++;
  }
  return { total: tasks.length, byStratum, byExpect, heldOut, sites: sites.size };
}

/** Everything that is pinned. Pure of the clock apart from `now`. */
export function computeFreeze({ p = paths(), now = new Date() } = {}) {
  if (!existsSync(p.corpus)) throw new Error(`CORPUS_MISSING ${p.corpus}`);
  const corpusBytes = readFileSync(p.corpus);
  const contractFiles = hashFiles(p.contracts, listFiles(p.contracts));
  if (Object.keys(contractFiles).length === 0) throw new Error(`CONTRACTS_MISSING ${p.contracts}`);
  const harnessFiles = hashFiles(p.root, listFiles(p.root, { excludedDirs: HARNESS_EXCLUDED_DIRS }));
  return {
    freezeVersion: FREEZE_VERSION,
    sha256: sha256(corpusBytes),
    frozenAt: now.toISOString(),
    counts: corpusCounts(corpusBytes),
    contracts: { sha256: combine(contractFiles), files: contractFiles },
    harness: { sha256: combine(harnessFiles), fileCount: Object.keys(harnessFiles).length, files: harnessFiles },
    // The A0/A1/S2 system instruction and the base of the S1/S3 contracts is read by lib/requests.mjs from this frozen copy of the production contract
    // (the live file is no longer read: SPK-07 evidence must not move when production changes).
    productionContract: { path: 'studio-runner/evaluation/grounding/contracts/frozen-production/guided-output-contract.md', sha256: existsSync(p.productionContract) ? sha256(readFileSync(p.productionContract)) : null },
    playwright: playwrightPin(),
  };
}

export function writeFreeze({ p = paths(), force = false, now = new Date() } = {}) {
  if (existsSync(p.freeze) && !force) throw new Error(`FREEZE_EXISTS ${p.freeze} (a refreeze invalidates earlier runs; pass --force to confirm)`);
  const freeze = computeFreeze({ p, now });
  const text = `${JSON.stringify(freeze, null, 1)}\n`;
  mkdirSync(dirname(p.freeze), { recursive: true });
  writeFileSync(p.freeze, text);
  mkdirSync(p.docsDir, { recursive: true });
  writeFileSync(p.docsFreeze, text);
  return freeze;
}

/**
 * Compares the frozen record with the current bytes. `errors` refuse a run; `warnings` are reported only
 * (the harness files may legitimately change after the freeze, but the report states that they did).
 */
export function verifyFreeze({ p = paths() } = {}) {
  const errors = [];
  const warnings = [];
  if (!existsSync(p.freeze)) return { ok: false, errors: [`FREEZE_MISSING ${p.freeze}`], warnings, freeze: null };
  let frozen;
  try { frozen = JSON.parse(readFileSync(p.freeze, 'utf8')); } catch { return { ok: false, errors: ['FREEZE_UNREADABLE'], warnings, freeze: null }; }
  let current = null;
  try { current = computeFreeze({ p }); } catch (error) { errors.push(String(error.message)); }
  if (current) {
    if (current.sha256 !== frozen.sha256) errors.push(`CORPUS_CHANGED frozen ${String(frozen.sha256).slice(0, 12)} now ${current.sha256.slice(0, 12)}`);
    if (current.contracts.sha256 !== frozen.contracts?.sha256) {
      const changed = sorted(new Set([...Object.keys(current.contracts.files), ...Object.keys(frozen.contracts?.files ?? {})]))
        .filter(file => current.contracts.files[file] !== frozen.contracts?.files?.[file]);
      errors.push(`CONTRACTS_CHANGED ${changed.join(',')}`);
    }
    if (current.productionContract.sha256 !== (frozen.productionContract?.sha256 ?? null)) errors.push('PRODUCTION_CONTRACT_CHANGED guided-output-contract.md');
    if (current.playwright.bundleSha256 !== frozen.playwright?.bundleSha256 || current.playwright.version !== frozen.playwright?.version) errors.push('PLAYWRIGHT_PIN_CHANGED');
    if (current.harness.sha256 !== frozen.harness?.sha256) {
      const changed = sorted(new Set([...Object.keys(current.harness.files), ...Object.keys(frozen.harness?.files ?? {})]))
        .filter(file => current.harness.files[file] !== frozen.harness?.files?.[file]);
      warnings.push(`HARNESS_CHANGED_SINCE_FREEZE ${changed.join(',')}`);
    }
  }
  if (existsSync(p.docsFreeze)) {
    try {
      const doc = JSON.parse(readFileSync(p.docsFreeze, 'utf8'));
      if (doc.sha256 !== frozen.sha256 || doc.contracts?.sha256 !== frozen.contracts?.sha256) errors.push('DOCS_FREEZE_DIFFERS_FROM_CORPUS_FREEZE');
    } catch { errors.push('DOCS_FREEZE_UNREADABLE'); }
  }
  return { ok: errors.length === 0, errors, warnings, freeze: frozen };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const force = process.argv.includes('--force');
  try {
    const freeze = writeFreeze({ force });
    console.log(JSON.stringify({ sha256: freeze.sha256, frozenAt: freeze.frozenAt, counts: freeze.counts, contracts: freeze.contracts.sha256, harness: freeze.harness.sha256 }, null, 1));
  } catch (error) { console.error(String(error.message)); process.exit(1); }
}
