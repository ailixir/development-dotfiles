import {collectPlaywright} from './collection.ts';
import { validateScanEnvelope } from './evaluate.ts';
import type { ScanFile } from './evaluate.ts';
import { requiredLifecycleCases } from './common.ts';
import { createSameDayAnchor, sameDayEvidenceDigest } from './anchor.ts';
import { recordCollectionFreeze } from './freeze.ts';
import { captureRuntimeFreeze, externalCoreDeclaration, readManifest } from './environment.ts';
/**
 * Operator CLI of the release gate. Run with Node 24 from frontend/:
 *   node e2e/realsite-gate/gate-cli.ts <init|verify|env|proxy|collect|scan|evaluate|report|cleanup> --run <id> [...]
 *
 * Exit codes of `evaluate` and `report`: 0 PASS, 1 FAIL, 2 INVALID or INCOMPLETE.
 * `report` writes the markdown even when the verdict is not PASS, and refuses dry- run ids.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONTEND_ROOT, REPO_ROOT, RUN_ID_RE, isDryRunId, loadTable, outRoot, readJson, runDir, writeJson } from './common.ts';
import { loadBundle } from './bundle.ts';
import { collectEnvironment } from './environment.ts';
import { evaluateRun, exitCodeFor, judgeVerify } from './evaluate.ts';
import { scanVerdict,requiredScanSources } from './leakscan.ts';
import { startRecorder } from './recorder.ts';
import { renderReport } from './report.ts';
import { runScan } from './scanrun.ts';
import { gatePorts } from './stack/ports.mjs';

function parseArgs(argv: string[]): { command: string; flags: Map<string, string> } {
  const [command = '', ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] ?? '';
    if (!token.startsWith('--')) continue;
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags.set(token.slice(2), 'true');
    else {
      flags.set(token.slice(2), next);
      i += 1;
    }
  }
  return { command, flags };
}

function requireRun(flags: Map<string, string>): string {
  const run = flags.get('run');
  if (run === undefined || !RUN_ID_RE.test(run)) throw new Error('--run must match rg-YYYYMMDD-N or dry-YYYYMMDD-N');
  return run;
}

export interface CliDependencies { scan?: (runId:string)=>Promise<ScanFile> }
export async function main(argv: string[] = process.argv.slice(2), dependencies:CliDependencies={}): Promise<number> {
  if (argv.some((arg)=>arg==='--nextday'||arg.startsWith('--nextday='))) throw new Error('--nextday was removed; the current gate accepts same-day evidence only');
  const { command, flags } = parseArgs(argv);
  const root = outRoot();
  switch (command) {
    case 'init': {
      const run = requireRun(flags);
      const secretsDir = process.env.CHECKS_GATE_SECRETS_DIR;
      if (secretsDir === undefined || secretsDir === '') throw new Error('CHECKS_GATE_SECRETS_DIR is required (outside the worktree and outside CHECKS_GATE_OUT)');
      mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
      const file = join(secretsDir, `${run}.canary`);
      if (!existsSync(file)) {
        const value = `cnry-${[0, 1, 2].map(() => randomBytes(6).toString('hex')).join('-')}`;
        writeFileSync(file, `${value}\n`, { mode: 0o600 });
        chmodSync(file, 0o600);
      }
      console.log(`canary file: ${file}\nexport CHECKS_GATE_CANARY_FILE=${file}`);
      return 0;
    }
    case 'verify': {
      const run = requireRun(flags);
      const table = loadTable();
      const dir = runDir(run, root);
      mkdirSync(dir, { recursive: true });
      const ids = [...new Set(table.tests.flatMap((t) => t.corpusTasks))];
      execFileSync(
        'node',
        ['evaluation/grounding/corpus/verify.mjs', '--tasks', './tasks.jsonl', '--only', ids.join(','), '--contexts', '3', '--concurrency', '3', '--out', join(dir, 'verify.json')],
        { cwd: join(REPO_ROOT, 'studio-runner'), stdio: 'inherit' },
      );
      // verify.mjs exits 0 even when tasks fail: judge the JSON, not the exit code.
      const judgement = judgeVerify(readJson(join(dir, 'verify.json')), table);
      writeJson(join(dir, 'verify-judgement.json'), judgement);
      console.log(`verify: ${judgement.checked} task ids checked, VOID: ${JSON.stringify(judgement.voidKeys)}, invalid: ${String(judgement.invalid)}`);
      return judgement.invalid !== null || Object.keys(judgement.voidKeys).length > 0 ? 1 : 0;
    }
    case 'env': {
      const run = requireRun(flags);
      const record = collectEnvironment({
        runId: run,
        dryRun: isDryRunId(run),
        outDir: root,
        gatewayDir: join(runDir(run, root), 'gateway'),
        proxyConfigured: (process.env.CHECKS_GATE_PROXY_URL ?? '') !== '',
        manifestPath: process.env.CHECKS_GATE_STACK_MANIFEST,
        backendUrl: process.env.CHECKS_E2E_BACKEND_URL ?? `http://127.0.0.1:${gatePorts().backend}`,
      });
      console.log(JSON.stringify(record, null, 2));
      return 0;
    }
    case 'proxy': {
      const run = requireRun(flags);
      const upstream = flags.get('upstream') ?? 'https://aiplatform.googleapis.com';
      const ports=gatePorts({...process.env,...(flags.has('port')?{CHECKS_GATE_PORT_RECORDER:flags.get('port')}: {})});
      const cap = process.env.CHECKS_GATE_MAX_CALLS ?? '';
      if (cap !== '' && !/^[1-9][0-9]*$/.test(cap)) throw new Error('CHECKS_GATE_MAX_CALLS must be a positive integer');
      const recorder = await startRecorder({ port: ports.recorder, upstream, outDir: join(runDir(run, root), 'gateway'), ...(cap === '' ? {} : { maxCalls: Number(cap) }) });
      console.log(`recorder for ${run} listening on 127.0.0.1:${recorder.port} -> ${upstream}${cap === '' ? '' : ` (call cap ${cap})`}`);
      await new Promise<void>((done) => {
        for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void recorder.close().then(done));
      });
      return 0;
    }
    case 'collect': {
      const run = requireRun(flags);
      const dir = runDir(run, root);
      const pwOut = resolve(FRONTEND_ROOT, 'node_modules/.cache/playwright-e2e');
      const collection=collectPlaywright(dir,false,pwOut,process.env.PLAYWRIGHT_JSON_OUTPUT_NAME);
      recordCollectionFreeze(join(dir,'freeze'),collection.attempt,{phase:'initial',at:new Date().toISOString(),freeze:captureRuntimeFreeze(readManifest(process.env.CHECKS_GATE_STACK_MANIFEST),externalCoreDeclaration())});
      console.log(`collected immutable Playwright evidence into ${collection.directory}`);
      return 0;
    }
    case 'scan': {
      const run = requireRun(flags);
      const file = dependencies.scan===undefined ? runScan({ root, runId: run, includePlaywrightOutput: true }) : await dependencies.scan(run);
      const verdict = scanVerdict(file.scan);
      console.log(
        `scan ${scanCommandExit(file,run)===0?'PASS':'FAIL'}: ${file.scan.filesScanned} files, ${file.scan.bytesScanned} bytes (+${file.scan.opaqueBytes} opaque), ` +
          `${file.scan.canaries.length} canaries, LEAK ${file.scan.leak}, PAGE_ORIGIN ${file.scan.pageOrigin}`,
      );
      for (const reason of verdict.reasons) console.log(`  - ${reason}`);
      return scanCommandExit(file,run);
    }
    case 'seal-same-day': {
      const run=requireRun(flags),dir=runDir(run,root),bundle=loadBundle(root,run);
      const evaluation=evaluateRun(bundle,'same-day');
      const controllerReceiptHash=flags.get('controller-receipt-sha256') ?? '';
      createSameDayAnchor(dir,{version:1,runId:run,event:'SAME_DAY_PASS',evidenceDigest:sameDayEvidenceDigest(dir),sourceDigest:bundle.environment?.git.workingTreeDigestStart ?? '',caseIds:requiredLifecycleCases(bundle.table).map((c)=>c.key),controllerReceiptHash,predicateVersion:'WI5-R2'},evaluation.verdict==='PASS');
      return 0;
    }
    case 'evaluate': {
      const run = requireRun(flags);
      const evaluation = evaluateRun(loadBundle(root, run));
      console.log(JSON.stringify({ runId: run, verdict: evaluation.verdict, invalid: evaluation.invalid, rules: evaluation.rules }, null, 2));
      return exitCodeFor(evaluation.verdict);
    }
    case 'report': {
      const runs = (flags.get('run') ?? '').split(',').filter((r) => r !== '');
      if (runs.length === 0 || runs.some((r) => !RUN_ID_RE.test(r))) throw new Error('--run takes a comma list of run ids, the candidate last');
      const out = flags.get('out');
      if (out === undefined) throw new Error('--out <markdown file> is required');
      const inputs = runs.map((id) => {
        const bundle = loadBundle(root, id);
        return { bundle, evaluation: evaluateRun(bundle) };
      });
      const rendered = renderReport(inputs, new Date().toISOString());
      if (rendered.refused !== null) {
        console.error(`report refused: ${rendered.refused}`);
        return rendered.exitCode;
      }
      mkdirSync(dirname(resolve(out)), { recursive: true });
      writeFileSync(out, rendered.markdown);
      console.log(`report written to ${out}: ${rendered.verdict}`);
      return rendered.exitCode;
    }
    case 'cleanup': {
      const run = requireRun(flags);
      const backend = process.env.CHECKS_E2E_BACKEND_URL ?? `http://127.0.0.1:${gatePorts().backend}`;
      const table = loadTable();
      let deleted = 0;
      for (const test of table.tests) {
        const file = join(runDir(run, root), 'results', `${test.key}.json`);
        if (!existsSync(file)) continue;
        const result = JSON.parse(readFileSync(file, 'utf8')) as { flows: { testId: string | null }[] };
        for (const flow of result.flows) {
          if (flow.testId === null) continue;
          const response = await fetch(`${backend}/api/v1/studio/tests/${flow.testId}`, { method: 'DELETE' });
          if (response.ok) deleted += 1;
        }
      }
      console.log(`deleted ${deleted} UI tests of ${run}`);
      return 0;
    }
    default:
      console.error('usage: node e2e/realsite-gate/gate-cli.ts <init|verify|env|proxy|collect|scan|evaluate|report|cleanup> --run <id> [--out file]');
      return 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (failure: unknown) => {
      console.error(failure instanceof Error ? failure.message : String(failure));
      process.exit(2);
    },
  );
}

export function scanCommandExit(file: ScanFile, expectedRunId: string = file.runId): number { return scanVerdict(file.scan,requiredScanSources(false,file.diagnosticsIncluded===true)).verdict==='PASS' && validateScanEnvelope(file,expectedRunId,false).length===0 ? 0 : 1; }
