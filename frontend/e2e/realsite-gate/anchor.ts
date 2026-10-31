import {rawManifest} from './collection.ts';
/** A seal is created only by an actual same-day verifier invocation, once per counted run. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from './common.ts';
import { instant } from './lifecycle.ts';
export interface SameDayAnchor {
  version: 1; runId: string; event: 'SAME_DAY_PASS'; occurredAt: string;
  evidenceDigest: string; sourceDigest: string; caseIds: string[];
  controllerReceiptHash: string; predicateVersion: string; eventHash: string;
}
export function anchorHash(a: Omit<SameDayAnchor,'eventHash'>): string { return sha256Hex(JSON.stringify(a)); }
/** Deliberately excludes nextday artifacts; every same-day input remains immutable after sealing. */
export function sameDayEvidenceDigest(dir: string): string {
  const files = ['environment.json','preconditions.json','verify.json','verify-judgement.json','gateway/requests.jsonl','hn-amendment.json','hn-preflight.json','hn-preflight.attempt.json'];
  for (const child of ['results','scan/history','freeze']) {
    const path = join(dir,child);
    if (existsSync(path)) for (const f of readdirSync(path).sort()) {
      if (f.endsWith('.json') && (child !== 'freeze' || ['start.json','initial.json'].includes(f)) && !f.startsWith('nextday-')) files.push(`${child}/${f}`);
    }
  }
  const raw:string[][]=[];
  for(const kind of ['collections','scan-attempts']){const path=join(dir,kind);if(existsSync(path))for(const name of readdirSync(path).sort().filter((n)=>n.startsWith('initial-'))){const full=join(path,name);raw.push([`${kind}/${name}`,name.endsWith('.json')?sha256Hex(readFileSync(full)):rawManifest(full).digest]);}}
  return sha256Hex(JSON.stringify({files:files.sort().map((f) => [f,existsSync(join(dir,f)) ? sha256Hex(readFileSync(join(dir,f))) : 'MISSING']),raw}));
}
export function anchorProblems(a: SameDayAnchor | undefined, runId: string, evidenceDigest: string, sourceDigest: string, caseIds: string[]): string[] {
  if (a === undefined) return ['UNKNOWN actual once-only whole-suite SAME_DAY_PASS event'];
  const {eventHash,...body}=a;
  const reasons: string[] = [];
  if (a.version !== 1 || a.event !== 'SAME_DAY_PASS' || a.runId !== runId || instant(a.occurredAt) === null || !/^[a-f0-9]{64}$/.test(a.controllerReceiptHash) || a.predicateVersion !== 'WI5-R2') reasons.push('invalid anchor provenance');
  if (a.evidenceDigest !== evidenceDigest || a.sourceDigest !== sourceDigest || a.caseIds.join() !== caseIds.join() || eventHash !== anchorHash(body)) reasons.push('anchor evidence/source/registry hash mismatch');
  return reasons;
}
export function createSameDayAnchor(directory: string, input: Omit<SameDayAnchor,'occurredAt'|'eventHash'>, verifiedSameDay: boolean): SameDayAnchor {
  if (!verifiedSameDay || !input.runId.startsWith('rg-') || !/^[a-f0-9]{64}$/.test(input.controllerReceiptHash)) throw new Error('same-day verification/controller receipt required');
  const body = {...input,occurredAt:new Date().toISOString()};
  const anchor: SameDayAnchor = {...body,eventHash:anchorHash(body)};
  writeFileSync(join(directory,'same-day-pass.json'),JSON.stringify(anchor)+'\n',{flag:'wx'});
  return anchor;
}
