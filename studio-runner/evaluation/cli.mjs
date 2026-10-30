#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
// eslint-disable-next-line no-restricted-imports -- Fixed evaluation self-test executable and file paths; no model input.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateManifest } from './oracle.mjs';
import { buildReport, renderReport, reportExitCode } from './report.mjs';
import {
  appendAdmission, buildBenchmark, canonicalJson, computeAdmission, emptyLedger, freezeManifest, guardStart, loadManifest, measureProposals, oracleMutationControl, sha256Hex,
  repoRootFrom, resolveInside, runBenchmark, validateCorpusManifest, verifyLedger, AdmissionError, createPublicApiClient, OBSERVED_AUTHORING_DIR,
} from './observed-authoring/evaluate.mjs';

const MANIFEST = fileURLToPath(new URL('./observed-authoring/manifest.json', import.meta.url));
const flag = (args, name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const out = (value) => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); };

/** Ceilings the ledger records. Code defaults (GuidedSessionProperties, GuidedTranslationProperties, application.yml); deployed values are NOT known. */
const CODE_DEFAULT_CAPS = Object.freeze({
  maxModelInputTokensTotal: 786432, maxModelOutputTokensTotal: 98304, maxOutputTokensPerCall: 4096, maxInputBytesPerCall: 65536, maxModelProposals: 100,
  csiDailyInputTokens: 5242880, csiDailyOutputTokens: 640000, maxConcurrentSessionsPerCsi: 3,
  source: 'code defaults (GuidedSessionProperties @DefaultValue, GuidedTranslationProperties @DefaultValue, application.yml csi-budget); the deployed values are not known',
});

/** The explicit proposal plan the token caps come from (MODEL-SIZING). No default: a missing flag is a refusal. */
function proposalPlanFromFlags(args) {
  const number = (name) => (flag(args, name) === undefined ? undefined : Number(flag(args, name)));
  return {
    plannedProposals: number('--planned-proposals'), contingencyFactor: number('--contingency'),
    inputBytesPerCall: number('--input-bytes-per-call'), inputTokenCap: number('--input-token-cap'),
    basis: flag(args, '--plan-basis'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const [command, input, output, markdown] = args;
  if (command === 'oracle-self-test') {
    // lifecycle.test.mjs left with the compile-era driver. browser-oracle.test.mjs imports dist/validator (artifact-1,
    // removed from dist) and is red at the pre-change baseline, so it is not run here; see the lane receipt.
    const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./oracle.test.mjs', import.meta.url))], { stdio: 'inherit' });
    return result.status ?? 2;
  }
  if (command === 'validate-manifest') {
    validateManifest(JSON.parse(await readFile(input, 'utf8')));
    process.stdout.write('Manifest valid\n');
    return 0;
  }
  if (command === 'summarize') {
    const evidence = JSON.parse(await readFile(input, 'utf8'));
    const planned = Array.isArray(evidence.planned) ? evidence.planned : evidence.plannedIds;
    if (!Array.isArray(planned) || !Array.isArray(evidence.trials)) throw new Error('Invalid evidence');
    // Without `run` (pins/budgets/concurrency) the report lists the gap and exits 2.
    const summary = buildReport({ trials: evidence.trials, planned, run: evidence.run, capacityEvents: evidence.capacityEvents });
    const json = `${JSON.stringify(summary, null, 2)}\n`;
    if (output) await writeFile(output, json, { flag: 'wx' }); else process.stdout.write(json);
    if (markdown) await writeFile(markdown, renderReport(summary), { flag: 'wx' });
    return reportExitCode(summary);
  }
  if (command === 'validate-corpus') {
    const manifest = loadManifest(input ?? MANIFEST);
    const result = validateCorpusManifest(manifest, { repoRoot: repoRootFrom() });
    out({ valid: result.errors.length === 0, errors: result.errors, counts: result.counts, gate: result.gate, sessionPlan: result.plan, frozen: manifest.manifestFrozenAt !== null });
    return result.errors.length === 0 ? 0 : 1;
  }
  if (command === 'freeze-corpus') {
    const manifest = freezeManifest(input ?? MANIFEST, { repoRoot: repoRootFrom() });
    const result = validateCorpusManifest(manifest, { repoRoot: repoRootFrom() });
    out({ frozenAt: manifest.manifestFrozenAt, manifestSha256: manifest.manifestSha256, errors: result.errors });
    return result.errors.length === 0 ? 0 : 1;
  }
  if (command === 'corpus-mutation-control') {
    const manifest = loadManifest(input ?? MANIFEST);
    const rows = [];
    for (const entry of manifest.cases) {
      if (entry.expectedOutcome === null) { rows.push({ id: entry.id, state: 'EXTERNAL_BLOCKED_NOT_ADMITTED' }); continue; }
      const expected = JSON.parse(readFileSync(resolveInside(OBSERVED_AUTHORING_DIR, entry.expectedOutcome.path), 'utf8'));
      const control = oracleMutationControl(expected, { sourceValue: 'v', freshValue: 'w' });
      rows.push({ id: entry.id, class: entry.class, ok: control.ok, positiveAccepted: control.positiveAccepted, mutants: Object.fromEntries(Object.entries(control.mutants).map(([k, v]) => [k, v.applicable ? (v.rejected ? 'rejected' : 'ACCEPTED') : 'n/a'])) });
    }
    out(rows);
    return rows.every((r) => r.ok === true || r.state !== undefined) ? 0 : 1;
  }
  if (command === 'admission-record') {
    // Appends one dated decision to the ledger. Price and headroom are read from flags and are never defaulted.
    const ledgerPath = input;
    const manifest = args.includes('--no-manifest') ? null : loadManifest(flag(args, '--manifest') ?? MANIFEST);
    const priceIn = flag(args, '--price-in');
    const priceOut = flag(args, '--price-out');
    const headroom = flag(args, '--headroom');
    const decision = computeAdmission({
      purpose: flag(args, '--purpose') ?? 'ac7-benchmark', manifest,
      price: priceIn === undefined || priceOut === undefined ? null : { pInPerMTok: Number(priceIn), pOutPerMTok: Number(priceOut), source: flag(args, '--price-source') ?? null },
      headroomUsd: headroom === undefined ? null : { value: Number(headroom), source: flag(args, '--headroom-source') ?? null },
      allocationUsd: flag(args, '--allocation') === undefined ? null : Number(flag(args, '--allocation')),
      enforcedCaps: CODE_DEFAULT_CAPS,
      proposalPlan: proposalPlanFromFlags(args),
      measuredProposalsPerSession: flag(args, '--measured') ? JSON.parse(readFileSync(flag(args, '--measured'), 'utf8')) : null,
      admittedBy: flag(args, '--admitted-by') ?? null,
    });
    const entry = appendAdmission(ledgerPath, decision, { create: args.includes('--create') });
    out({ seq: entry.seq, status: entry.status, purpose: entry.purpose });
    return entry.status === 'ADMITTED' ? 0 : 2;
  }
  if (command === 'admission-guard') {
    const ledger = JSON.parse(await readFile(input, 'utf8'));
    const problems = verifyLedger(ledger);
    if (problems.length > 0) { out({ guard: 'LEDGER_CORRUPT', problems }); return 2; }
    try {
      guardStart({ ledger, manifestSha256: loadManifest(output ?? MANIFEST).manifestSha256 });
      out({ guard: 'OPEN' });
      return 0;
    } catch (error) {
      if (error instanceof AdmissionError) { out({ guard: 'REFUSED', code: error.code }); return 2; }
      throw error;
    }
  }
  if (command === 'b7') {
    const docs = args.slice(1).filter((x) => !x.startsWith('--')).map((file) => ({ label: file.split('/').at(-1), ...JSON.parse(readFileSync(file, 'utf8')) }));
    out(measureProposals(docs));
    return 0;
  }
  if (command === 'benchmark-report') {
    // Offline only. No client, provider call or admission append; original execution facts are immutable.
    if (!output) throw new Error('benchmark-report requires a fresh directory');
    const config = JSON.parse(await readFile(input, 'utf8'));
    const manifestPath = resolve(config.manifest ?? MANIFEST);
    const manifest = loadManifest(manifestPath);
    const validation = validateCorpusManifest(manifest, { root: config.corpusRoot ?? dirname(manifestPath), repoRoot: repoRootFrom() });
    if (validation.errors.length > 0) throw new Error(`MANIFEST_INVALID:${validation.errors.slice(0, 5).join(' | ')}`);
    const readPinned = async (reference) => {
      if (!reference || typeof reference.path !== 'string' || !/^[a-f0-9]{64}$/u.test(reference.sha256 ?? '')) throw new Error('review input reference');
      const fileText = await readFile(reference.path, 'utf8');
      if (Buffer.byteLength(fileText) > 8_000_000 || sha256Hex(fileText) !== reference.sha256) throw new Error('review input hash');
      return { fileText, sha256: reference.sha256 };
    };
    const readDocument = async (reference) => {
      if (reference === undefined || reference === null) return null;
      const pinned = await readPinned(reference);
      return { ...pinned, value: JSON.parse(pinned.fileText) };
    };
    const raw = await readPinned(config.rawRuns);
    const annotations = await readPinned(config.causeAnnotations);
    const runs = raw.fileText.split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
    const mode = runs.length > 0 && runs.every((run) => run.mode === 'HARNESS_SELF_TEST') ? 'HARNESS_SELF_TEST' : 'D_C';
    if (config.mode !== undefined && config.mode !== mode) throw new Error('review cannot promote execution mode');
    const reviewInput = {
      rawRunsText: raw.fileText, overlayText: annotations.fileText, overlay: JSON.parse(annotations.fileText),
      reviews: await Promise.all((config.reviews ?? []).map(readDocument)),
      adoption: await readDocument(config.independentQaAdoption), execution: await readDocument(config.originalExecution), ledger: await readDocument(config.admissionLedger), intervalLedger: await readDocument(config.intervalAdmissionLedger),
      inputFileSha256: { rawRuns: raw.sha256, causeAnnotations: annotations.sha256 },
    };
    const benchmark = buildBenchmark({ manifest, runs, mode, reviewInput, root: config.corpusRoot ?? dirname(manifestPath), repoRoot: repoRootFrom() });
    await mkdir(output, { recursive: false });
    await writeFile(`${output}/benchmark.json`, `${JSON.stringify(benchmark, null, 2)}\n`, { flag: 'wx' });
    await writeFile(`${output}/input-bindings.json`, `${JSON.stringify(benchmark.reviewProvenance, null, 2)}\n`, { flag: 'wx' });
    return benchmark.gate.verdict === 'GATE_PASS' ? 0 : benchmark.gate.verdict === 'GATE_FAIL' ? 1 : 2;
  }
  if (command === 'benchmark') {
    // Live D_C run. Refused unless the ledger's latest entry is ADMITTED for exactly this manifest.
    const config = JSON.parse(await readFile(input, 'utf8'));
    if (!output) throw new Error('benchmark requires a new evidence directory');
    const ledgerPath = config.admissionLedger;
    const ledgerText = ledgerPath && existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : canonicalJson(emptyLedger());
    const ledger = JSON.parse(ledgerText);
    const token = process.env.STUDIO_EVAL_API_TOKEN;
    if (!token) throw new Error('Evaluation identity unavailable');
    const manifest = loadManifest(config.manifest ?? MANIFEST);
    // Refuse before anything is created or contacted: no evidence directory, no client, no API call.
    const validation = validateCorpusManifest(manifest, { root: dirname(resolve(config.manifest ?? MANIFEST)), repoRoot: repoRootFrom() });
    if (validation.errors.length > 0) throw new Error(`MANIFEST_INVALID:${validation.errors.slice(0, 5).join(' | ')}`);
    const startedAt = new Date().toISOString();
    const originalAdmission = guardStart({ ledger, manifestSha256: manifest.manifestSha256, now: new Date(startedAt) });
    if (ledgerPath && sha256Hex(readFileSync(ledgerPath, 'utf8')) !== sha256Hex(ledgerText)) throw new AdmissionError('LEDGER_CHANGED_BEFORE_START');
    const client = createPublicApiClient({ baseUrl: config.apiBaseUrl, token, csiId: config.csiId, environmentId: config.environmentId });
    await mkdir(output, { recursive: false });
    const { runs, benchmark } = await runBenchmark({ manifest, mode: 'D_C', client, ledger, repoRoot: repoRootFrom() });
    const rawRunsText = `${runs.map((r) => JSON.stringify(r)).join('\n')}\n`;
    await writeFile(`${output}/runs.jsonl`, rawRunsText, { flag: 'wx' });
    // Actual future measurement only: preserve the prior snapshot and capture append-only history after
    // the original end. These unreviewed bytes do not themselves authenticate complete interval history.
    const finishedAt = new Date().toISOString();
    const intervalLedgerText = ledgerPath && existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : null;
    const execution = { kind: 'STUDIO_OBS_009_EXECUTION_RECEIPT', mode: 'D_C', startedAt, finishedAt,
      intervalLedgerSha256: intervalLedgerText === null ? null : sha256Hex(intervalLedgerText), manifestSha256: manifest.manifestSha256, rawRunsSha256: sha256Hex(rawRunsText),
      ledgerSha256: sha256Hex(ledgerText), admissionSeq: originalAdmission.seq, admissionEntrySha256: sha256Hex(canonicalJson(originalAdmission)),
      configurationSha256: sha256Hex(canonicalJson({ enforcedCaps: originalAdmission.enforcedCaps, pinned: originalAdmission.pinned })), observationComplete: runs.every((run) => (run.details?.driverObservations ?? []).length === 0), status: 'RAW_EMITTED_UNREVIEWED' };
    await writeFile(`${output}/admission-ledger.json`, ledgerText, { flag: 'wx' });
    if (intervalLedgerText !== null) await writeFile(`${output}/admission-ledger-interval.json`, intervalLedgerText, { flag: 'wx' });
    await writeFile(`${output}/execution.json`, `${JSON.stringify(execution, null, 2)}\n`, { flag: 'wx' });
    await writeFile(`${output}/benchmark.json`, `${JSON.stringify(benchmark, null, 2)}\n`, { flag: 'wx' });
    return benchmark.gate.verdict === 'GATE_PASS' ? 0 : benchmark.gate.verdict === 'GATE_FAIL' ? 1 : 2;
  }
  process.stderr.write([
    'Usage: node evaluation/cli.mjs',
    '  validate-manifest FILE | oracle-self-test | summarize FILE [OUT_JSON] [OUT_MD]      (compile-era oracle/report layer)',
    '  validate-corpus [FILE] | freeze-corpus [FILE] | corpus-mutation-control [FILE]       (observed-authoring corpus)',
    '  admission-record LEDGER [--create] [--purpose P] [--no-manifest] --planned-proposals N --contingency F (--input-bytes-per-call N | --input-token-cap N) --plan-basis TEXT [--measured FILE] [--price-in --price-out --price-source --headroom --headroom-source --allocation] | admission-guard LEDGER [MANIFEST]',
    '  benchmark-report CONFIG NEW_DIR (offline original JSONL + cause-only overlay + original admission + independent review; no calls)',
    '  b7 EVIDENCE_JSON... | benchmark CONFIG NEW_EVIDENCE_DIR                              (benchmark refuses without an ADMITTED ledger entry)',
    '',
  ].join('\n'));
  return 2;
}
main().then((code) => { process.exitCode = code; }).catch((error) => {
  // Do not render arbitrary manifest/body/credential-bearing exception messages; closed admission/manifest codes are safe.
  const safe = error instanceof AdmissionError || (error instanceof Error && /^(MANIFEST_INVALID|LEDGER_[A-Z_]+)/u.test(error.message));
  process.stderr.write(safe ? `Evaluation refused: ${error.message.slice(0, 300)}\n` : 'Evaluation failed: invalid input, unavailable prerequisite, or evidence path.\n');
  process.exitCode = 2;
});
