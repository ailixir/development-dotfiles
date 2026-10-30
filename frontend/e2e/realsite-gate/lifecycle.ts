/** Safe lineage decisions. Missing authoritative fields remain incomplete; timestamps never come from UI elapsed hours. */
import type { ReplayRecord } from './evaluate.ts';
export interface ExecutionLineage {
  testId: string;
  revisionId: string;
  acceptedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  errorCode: string | null;
  beforeExecutionIds: string[];
  passedStepIds: string[];
}
export interface PublishedLineage { authoredStepsHash?: string; testId: string; revisionId: string; sourceRevision: number; configurationRevision: number; learnedCompletedAt: string; stepIds: string[] }
export function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
export function executionFindings(id: string, lineage: ExecutionLineage | undefined, published: PublishedLineage | undefined): string[] {
  if (lineage === undefined || published === undefined) return ['UNKNOWN authoritative execution/publication lineage'];
  const reasons: string[] = [];
  if (lineage.testId !== published.testId || lineage.revisionId !== published.revisionId) reasons.push('execution crosses test or published revision');
  if (lineage.beforeExecutionIds.includes(id) || new Set(lineage.beforeExecutionIds).size !== lineage.beforeExecutionIds.length) reasons.push('execution ID is reused or prior set is duplicate');
  if (lineage.errorCode !== null) reasons.push('execution carries an error');
  const accepted = instant(lineage.acceptedAt), start = instant(lineage.startedAt), end = instant(lineage.endedAt);
  if (accepted === null || start === null || end === null || accepted > start || start > end) reasons.push('UNKNOWN or contradictory server execution times');
  if (new Set(lineage.passedStepIds).size !== lineage.passedStepIds.length || published.stepIds.some((s) => !lineage.passedStepIds.includes(s))) reasons.push('execution did not pass every authored step');
  return reasons;
}
export function cleanManualFindings(r:ReplayRecord):string[]{return r.status!=='PASSED'||r.triggerSource!=='MANUAL'||r.replayFailureCode!==null||!r.uiReceipt||!r.learnedChip?['manual execution is not a clean PASSED/MANUAL outcome with saved/UI receipts']:[];}
export interface EditEvidence {
  before: PublishedLineage; after: PublishedLineage; editedStepId: string;
  prefixReplayed: string[]; suffixLearned: string[]; prefixModelCalls: number;
  proofRevisionId: string; manual: ReplayRecord;
}
export function editFindings(e: EditEvidence): string[] {
  const reasons: string[] = [];
  const edited = e.before.stepIds.indexOf(e.editedStepId);
  if (edited < 1 || e.before.testId !== e.after.testId || e.before.revisionId === e.after.revisionId || e.after.sourceRevision <= e.before.sourceRevision || e.before.configurationRevision !== e.after.configurationRevision || e.before.stepIds.join() !== e.after.stepIds.join()) reasons.push('edit lost stable IDs or revision lineage');
  if (e.prefixModelCalls !== 0 || e.prefixReplayed.join() !== e.before.stepIds.slice(0, edited).join() || e.suffixLearned.join() !== e.after.stepIds.slice(edited).join()) reasons.push('prefix/suffix execution mismatch');
  if (e.proofRevisionId !== e.after.revisionId) reasons.push('stale edited proof');
  reasons.push(...cleanManualFindings(e.manual));
  reasons.push(...executionFindings(e.manual.executionId, e.manual.lineage, e.after));
  return reasons;
}
export interface ValueBindingWitness { bindingId: string; sourceStepId: string; consumerStepId: string; regionId: string; valueDigest: string }
export function twoBindingFindings(actual: ValueBindingWitness[], expected: ValueBindingWitness[]): string[] {
  if (expected.length !== 2 || actual.length !== 2 || new Set(expected.map((x) => x.valueDigest)).size !== 2 || new Set(expected.map((x) => x.bindingId)).size !== 2) return ['two distinct independent bindings required'];
  return expected.flatMap((e) => {
    const a = actual.find((x) => x.consumerStepId === e.consumerStepId);
    return a === undefined || Object.keys(e).some((k) => a[k as keyof ValueBindingWitness] !== e[k as keyof ValueBindingWitness]) ? ['swapped, overwritten or wrong-region binding'] : [];
  });
}
