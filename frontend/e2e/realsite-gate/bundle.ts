import {rawManifest,requireCompletePriorScans} from './collection.ts';
import {scanEvidenceDigest} from './scan-identity.ts';
import {applyHnAmendment,hnAmendmentProblems,resolveHnAmendment} from './public-label-preflight.ts';
import type {HnAmendment,HnPublicCapture} from './public-label-preflight.ts';
/** Strict on-disk boundary. Missing evidence stays absent; malformed/crossed/duplicate evidence throws. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { caseFilename, isDryRunId, loadTable, readJson, requiredLifecycleCases, runDir, RUN_ID_RE } from './common.ts';
import type { GateTable } from './common.ts';
import { summarizeRecorder } from './environment.ts';
import { sameDayEvidenceDigest } from './anchor.ts';
import type { SameDayAnchor } from './anchor.ts';
import { collectFreezeCheckpoints } from './freeze.ts';
import type { RegionAudit } from './region-audit.ts';
import type { EnvironmentRecord, NextDayResult, RunBundle, ScanFile, TestResult, VerifyJudgement } from './evaluate.ts';
import { parseLearningTiming } from './status.ts';
const readIf = <T>(path: string): T | null => existsSync(path) ? readJson<T>(path) : null;
function object(value: unknown): Record<string,unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid evidence object');
  return value as Record<string,unknown>;
}
function identity(value: unknown, runId: string): Record<string,unknown> {
  const r=object(value);
  if (r.schemaVersion !== 1 || r.runId !== runId) throw new Error('evidence schema/run identity mismatch');
  return r;
}
export function loadBundle(root: string, runId: string, table: GateTable = loadTable()): RunBundle {
  if (!RUN_ID_RE.test(runId)) throw new Error('invalid run ID');
  const cases=requiredLifecycleCases(table),dir=runDir(runId,root);
  requireCompletePriorScans(dir);
  const environment=readIf<EnvironmentRecord>(join(dir,'environment.json'));
  if (environment !== null && environment.runId !== runId) throw new Error('environment crossed run');
  const hnAmendment=readIf<HnAmendment>(join(dir,'hn-amendment.json')) ?? undefined;
  const hnCapture=readIf<{runId:string;captured:HnPublicCapture;sourceCaptureHash:string}>(join(dir,'hn-preflight.json'));
  const hnPreflight=hnAmendmentProblems(hnAmendment,runId,environment?.startedAt ?? '').length===0&&hnCapture!==null&&hnCapture.runId===runId&&hnAmendment!==undefined&&hnCapture.sourceCaptureHash===hnAmendment.sourceCaptureHash&&resolveHnAmendment(hnCapture.captured,runId).sourceCaptureHash===hnAmendment.sourceCaptureHash;
  if(hnAmendment!==undefined&&environment!==null)applyHnAmendment(table,hnAmendment,runId,environment.startedAt);
  const preconditions=readIf<{ok:boolean}>(join(dir,'preconditions.json'));
  if (preconditions !== null && typeof preconditions.ok !== 'boolean') throw new Error('invalid preconditions');
  const judgement=readIf<VerifyJudgement>(join(dir,'verify-judgement.json'));
  const results: RunBundle['results']={};
  const resultDir=join(dir,'results');
  if (existsSync(resultDir)) for (const filename of readdirSync(resultDir)) {
    if (!filename.endsWith('.json')) throw new Error('unexpected result artifact');
    const raw=readJson<unknown>(join(resultDir,filename)),r=identity(raw,runId);
    const expected=table.tests.find((t) => caseFilename(t.key) === filename);
    if (expected === undefined || r.key !== expected.key || r.kind !== expected.kind || !Array.isArray(r.flows) || !['RAN','VOID'].includes(String(r.status))) throw new Error('result filename/key/kind mismatch');
    const flowIds=r.flows.map((f) => object(f).flowId);
    if (new Set(flowIds).size !== flowIds.length || (r.status !== 'VOID' && flowIds.sort().join() !== (expected.flows?.map((f) => f.id) ?? ['main']).sort().join())) throw new Error('result missing/duplicate/extra flows');
    for (const rawFlow of r.flows) {
      const flow = object(rawFlow);
      if (flow.learningTiming === undefined) {
        if (expected.kind === 'positive' && flow.learned === true) throw new Error('missing current learning timing coverage');
      } else {
        const timing = parseLearningTiming(flow.learningTiming);
        if (timing.runId !== runId || timing.testId !== flow.testId) throw new Error('crossed learning timing run/test');
        const publication = flow.publication === undefined ? null : object(flow.publication);
        const last = timing.receipts.at(-1);
        if (publication !== null && last !== undefined && (last.sourceRevision !== String(publication.sourceRevision) || last.configurationRevision !== String(publication.configurationRevision) || JSON.stringify(last.stepIds) !== JSON.stringify(publication.stepIds))) throw new Error('crossed learning timing revision/step');
      }
    }
    results[expected.key]=raw as TestResult;
  }
  function scan(path: string, nextday: boolean): ScanFile | undefined {
    const s=readIf<ScanFile>(path);
    if (s===null) return undefined;
    if (s.runId !== runId || s.nextday !== nextday || !Array.isArray(s.scan?.sources) || !Array.isArray(s.scan?.hits) || !Array.isArray(s.scan?.canaries) || typeof s.scan.formsPerCanary !== 'object' || s.exercised===null || typeof s.exercised !== 'object') throw new Error('scan envelope crossed or malformed');
    if(s.rawSnapshot!==undefined){const path=s.rawSnapshot.directory;if(!/^scan-attempts\/(initial|nextday)-[a-f0-9-]+$/.test(path)||rawManifest(join(dir,path)).digest!==s.rawSnapshot.manifest.digest)throw new Error('raw scan evidence changed or crossed');}
    return s;
  }
  const scanFile=scan(join(dir,'scan','scan.json'),false),scanNextdayFile=scan(join(dir,'scan','scan-nextday.json'),true);
  const scanHistory: ScanFile[]=[];
  const historyDir=join(dir,'scan','history');
  if (existsSync(historyDir)) for (const f of readdirSync(historyDir).sort()) {
    const entry=scan(join(historyDir,f),f.startsWith('nextday-'));
    if (entry!==undefined) scanHistory.push(entry);
  }
  let nextday: RunBundle['nextday']=null;
  const ndDir=join(dir,'nextday');
  if (existsSync(ndDir)) {
    nextday={};
    for (const file of readdirSync(ndDir)) {
      const raw=readJson<unknown>(join(ndDir,file)),r=identity(raw,runId);
      const expected=cases.find((c) => caseFilename(c.key)===file);
      if (expected===undefined || r.key!==expected.key || nextday[expected.key]!==undefined || !['PASSED','FAILED','NOT_LEARNED'].includes(String(r.status))) throw new Error('nextday filename/key/duplicate identity mismatch');
      nextday[expected.key]=raw as NextDayResult;
    }
  }
  const proxy=summarizeRecorder(join(dir,'gateway'),environment?.proxyConfigured ?? false);
  return {scanDataDigest:scanEvidenceDigest(dir,false),nextdayDataDigest:scanEvidenceDigest(dir,true),hnPreflight,hnAmendment,table,runId,environment,preconditionsOk:preconditions?.ok ?? null,voidKeys:judgement?.voidKeys ?? {},results,proxy,
    scan:scanFile?.scan ?? null,scanNextday:scanNextdayFile?.scan ?? null,scanFile,scanNextdayFile,scanHistory,nextday,
    anchor:readIf<SameDayAnchor>(join(dir,'same-day-pass.json')) ?? undefined,sameDayDigest:sameDayEvidenceDigest(dir),
    regionAudit:readIf<RegionAudit>(join(dir,'region-audit.json')) ?? {required:Object.values(results).flatMap((r)=>(r?.flows ?? []).flatMap((f)=>f.regionAudit?.required ?? [])),witnesses:Object.values(results).flatMap((r)=>(r?.flows ?? []).flatMap((f)=>f.regionAudit?.witnesses ?? [])),truth:Object.values(results).flatMap((r)=>(r?.flows ?? []).flatMap((f)=>f.regionAudit?.truth ?? [])),collectedAt:new Date().toISOString()},freeze:collectFreezeCheckpoints(join(dir,'freeze')),
    truncations:proxy.truncations,
  };
}
export const isEvidenceRun = (runId: string): boolean => !isDryRunId(runId);
