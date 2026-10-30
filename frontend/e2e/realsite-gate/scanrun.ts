import {incorporateOriginalUiText} from './ui-text.ts';
import {collectionRecords,newRawDirectory,rawManifest,requireCompletePriorScans,snapshotSources} from './collection.ts';
import {scanEvidenceDigest} from './scan-identity.ts';
/**
 * Orchestrates one leak scan over every sink of the stack and writes the current same-day scan.json.
 * Used by `gate-cli scan` and by the spec's final in-run scan (which cannot include the Playwright
 * output yet; the CLI scan after `collect` is the authoritative one).
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GATE_DIR, readJson, runDir, writeJson } from './common.ts';
import { loadCanaries, readManifest } from './environment.ts';
import type { ScanFile } from './evaluate.ts';
import { pageTextPredicate, scanSources } from './leakscan.ts';
import type { Canary, PageTextSources, SourceSpec } from './leakscan.ts';
import { dumpTable, listPublicTables, psqlConfigFromEnv } from './status.ts';

export const loadPageTextSources = (): PageTextSources => readJson<PageTextSources>(join(GATE_DIR, 'page-text-sources.json'));

export interface CollectedScanInputs { canaries: Canary[]; sources: SourceSpec[]; db: {tables:number;rows:number;bytes:number}; exercised: Record<string,boolean> }
export interface RunScanOptions {
  /** Synthetic collector injection exercises the real scan/write boundary without secrets or services. */
  collect?: () => CollectedScanInputs;
  root: string;
  runId: string;
  /** The Playwright output copy exists only after `gate-cli collect`. */
  includePlaywrightOutput: boolean;
}

export function runScan(options: RunScanOptions): ScanFile {
  const dir = runDir(options.runId, options.root);
  if (options.collect !== undefined) return writeCollectedScan(options,options.collect());
  const sourcesTable = loadPageTextSources();
  const manifest = readManifest(process.env.CHECKS_GATE_STACK_MANIFEST);
  if (manifest === null) throw new Error('CHECKS_GATE_STACK_MANIFEST is required to scan the runner, backend, Core and issuer logs');
  const canaries = loadCanaries();

  // Every table of the public schema, dumped fresh.
  const cfg = psqlConfigFromEnv();
  mkdirSync(join(dir,'scan-attempts'),{recursive:true});
  const raw=newRawDirectory(dir,'scan-attempts',false);
  const dbDir=join(raw.directory,'sources','db');
  mkdirSync(dbDir,{recursive:true});
  const tables = listPublicTables(cfg);
  let rows = 0;
  let bytes = 0;
  for (const name of tables) {
    const d = dumpTable(cfg, name, join(dbDir, `${name}.jsonl`));
    rows += d.rows;
    bytes += d.bytes;
  }

  // The Vault container's own log.
  const vaultLog = join(raw.directory,'sources','vault.log');
  mkdirSync(dirname(vaultLog), { recursive: true });
  try {
    const logs = execFileSync('docker', ['logs', manifest.vault.container], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(vaultLog, logs);
  } catch {
    rmSync(vaultLog, { force: true });
  }

  const never = (): boolean => false;
  const sources: SourceSpec[] = [
    { name: 'db', root: dbDir, mayCarryPageText: pageTextPredicate(sourcesTable, 'db') },
    { name: 'runner', root: manifest.runner.logPath, mayCarryPageText: never },
    { name: 'runner-objects', root: join(manifest.runner.workDir, 'objects'), mayCarryPageText: never },
    { name: 'backend', root: manifest.logs.backend, mayCarryPageText: never },
    { name: 'core', root: manifest.logs.core, mayCarryPageText: never },
    { name: 'issuer', root: manifest.logs.issuer, mayCarryPageText: never },
    { name: 'vault', root: vaultLog, mayCarryPageText: never },
    { name: 'ui', root: join(dir, 'ui'), mayCarryPageText: never },
    { name: 'results', root: join(dir, 'results'), mayCarryPageText: never },
  ];
  sources.push({ name: 'runner-journal', root: manifest.runner.journalDir ?? join(dir,'MISSING-runner-journal'), mayCarryPageText: never });
  sources.push({ name: 'gateway', root: join(dir, 'gateway'), mayCarryPageText: pageTextPredicate(sourcesTable, 'gateway') });
  if(options.includePlaywrightOutput){const records=collectionRecords(dir,false);sources.push({name:'playwright',root:records.length?join(dir,'collections'):join(dir,'MISSING-current-stage-playwright-collection'),mayCarryPageText:never});}

  return writeCollectedScan(options,{canaries,sources,db:{tables:tables.length,rows,bytes},exercised:{}},raw);
}
/** One actual collector boundary shared by production and synthetic dependency-injected tests. */
function writeCollectedScan(options: RunScanOptions, inputs: CollectedScanInputs, allocated?:ReturnType<typeof newRawDirectory>): ScanFile {
  const dir=runDir(options.runId,options.root);
  requireCompletePriorScans(dir,allocated?.relativeDirectory);
  mkdirSync(join(dir,'scan-attempts'),{recursive:true});
  const raw=allocated ?? newRawDirectory(dir,'scan-attempts',false);
  const sources=[...inputs.sources];
  const diagnosticsIncluded=existsSync(join(dir,'diagnostics'));
  if(diagnosticsIncluded&&!sources.some((s)=>s.name==='diagnostics'))sources.push({name:'diagnostics',root:join(dir,'diagnostics'),mayCarryPageText:()=>false});
  const snapshots=snapshotSources(raw.directory,sources);
  const scan=scanSources(inputs.canaries,snapshots,{pageText:'',db:inputs.db});
  const ui=snapshots.find((s)=>s.name==='ui');
  incorporateOriginalUiText(scan,ui?.root ?? join(raw.directory,'MISSING-ui'),options.runId);
  const rawSnapshot={directory:raw.relativeDirectory,manifest:rawManifest(raw.directory)};
  const file: ScanFile={rawSnapshot,diagnosticsIncluded,dataDigest:scanEvidenceDigest(dir,false),runId:options.runId,generatedAt:new Date().toISOString(),nextday:false,authoritative:options.includePlaywrightOutput,exercised:inputs.exercised,scan};
  const history=join(dir,'scan','history');
  mkdirSync(history,{recursive:true});
  writeFileSync(join(history,`initial-${randomUUID()}.json`),JSON.stringify(file)+'\n',{flag:'wx'});
  if(options.includePlaywrightOutput) writeJson(join(dir,'scan','scan.json'),file);
  return file;
}
