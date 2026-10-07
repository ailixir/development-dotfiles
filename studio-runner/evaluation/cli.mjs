#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
// eslint-disable-next-line no-restricted-imports -- Fixed evaluation self-test executable and file paths; no model input.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './oracle.mjs';
import { buildReport, renderReport, reportExitCode } from './report.mjs';
import { runEvaluation } from './lifecycle.mjs';

async function main() {
  const [command, input, output, markdown] = process.argv.slice(2);
  if (command === 'oracle-self-test') {
    const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./oracle.test.mjs', import.meta.url)), fileURLToPath(new URL('./browser-oracle.test.mjs', import.meta.url)), fileURLToPath(new URL('./lifecycle.test.mjs', import.meta.url))], {stdio:'inherit'});
    return result.status ?? 2;
  }
  if (command === 'validate-manifest') {
    validateManifest(JSON.parse(await readFile(input,'utf8')));
    process.stdout.write('Manifest valid\n'); return 0;
  }
  if (command === 'summarize') {
    const evidence = JSON.parse(await readFile(input,'utf8'));
    const planned = Array.isArray(evidence.planned) ? evidence.planned : evidence.plannedIds;
    if (!Array.isArray(planned) || !Array.isArray(evidence.trials)) throw new Error('Invalid evidence');
    // Without `run` (pins/budgets/concurrency) the report lists the gap and exits 2.
    const summary = buildReport({trials:evidence.trials,planned,run:evidence.run,capacityEvents:evidence.capacityEvents});
    const json = JSON.stringify(summary,null,2)+'\n';
    if (output) await writeFile(output,json,{flag:'wx'}); else process.stdout.write(json);
    if (markdown) await writeFile(markdown,renderReport(summary),{flag:'wx'});
    return reportExitCode(summary);
  }
  if (command === 'run') {
    const config = JSON.parse(await readFile(input,'utf8'));
    validateManifest(JSON.parse(await readFile(config.manifest,'utf8')));
    if (!output) throw new Error('run requires a new evidence directory');
    await mkdir(output,{recursive:false});
    return runEvaluation(config, JSON.parse(await readFile(config.manifest,'utf8')), output);
  }
  process.stderr.write('Usage: node evaluation/cli.mjs validate-manifest FILE | oracle-self-test | summarize FILE [OUT_JSON] [OUT_MD] | run CONFIG NEW_EVIDENCE_DIR\n');
  return 2;
}
main().then(code=>{process.exitCode=code;}).catch(()=>{
  // Do not render arbitrary manifest/body/credential-bearing exception messages.
  process.stderr.write('Evaluation failed: invalid input, unavailable prerequisite, or evidence path.\n');
  process.exitCode=2;
});
