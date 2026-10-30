/**
 * The collection deadline of an observation (ADR-SC-007 D1; plan D-5; critique 1 items B6 and C1).
 *
 * The backend gives every runner call a 15 s transport window (HttpRunnerDispatchClient.transportDeadline). The runner's answer must
 * leave inside it, so the deadline D is the measured rule D = min(12,000 ms, ceil_1s(6 x P)) where P is the larger of the slowest
 * median observation time of the typical page set and the S3 spike p95 (866 ms); 12,000 ms is the window minus a 3 s reserve.
 *
 * OBSERVATION_DEADLINE_MS is the number the rule gives on the recorded evidence (docs/qa/evidence/adr-sc-007/wi-4/collection-deadline.json,
 * tools/measure-observation.mjs): the slowest median of the typical set was 2,599 ms (a generated 24,000-node page with 300 inventory entries, settle on),
 * so 6 x P exceeds the ceiling and D is the 12,000 ms ceiling. observationDeadline.test.ts ties the constant to that evidence.
 */
import { ClosedActionError } from './closedError.js';
import { DEFAULT_WORK_BUDGET_UNITS } from './privateInventory.js';

export { PREPARE_BUDGET_MS } from './actionBudget.js';

export const TRANSPORT_CEILING_MS = 15_000;
export const DEADLINE_CEILING_MS = 12_000;
export const SPIKE_P95_MS = 866;
export const OBSERVATION_DEADLINE_MS = 12_000;
/** WI-2 measured 1.2 to 1.5 million work units per millisecond; the budget is derived from the remaining time at 1 million per ms so units run out first. */
export const UNITS_PER_MS = 1_000_000;

export function deadlineFromMeasurements(rows: readonly { page: string; medianMs: number }[], spikeP95Ms: number = SPIKE_P95_MS): number {
  const slowestMedian = rows.reduce((max, row) => Math.max(max, row.medianMs), 0);
  const p = Math.max(slowestMedian, spikeP95Ms);
  return Math.min(DEADLINE_CEILING_MS, Math.ceil((6 * p) / 1000) * 1000);
}

/** The work-unit budget of the synchronous sanitizer for the time that remains (never above the WI-2 default). */
export function unitsFor(remainingMs: number): number {
  return Math.min(DEFAULT_WORK_BUDGET_UNITS, Math.max(1, Math.floor(remainingMs * UNITS_PER_MS)));
}

/**
 * Races awaited work against the deadline: when the timer wins, `onExpiry` runs (it fails the inventory and releases the engine) and the
 * call rejects with the closed OBSERVATION_DEADLINE. The abandoned promise gets a no-op catch so it can never surface later.
 */
export function raceDeadline<T>(work: Promise<T>, deadlineAt: number, onExpiry: () => void, now: () => number = Date.now): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { onExpiry(); } catch { /* expiry cleanup is best effort */ }
      work.catch(() => undefined);
      reject(new ClosedActionError('OBSERVATION_DEADLINE'));
    }, Math.max(1, deadlineAt - now()));
    work.then(
      value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); },
      (error: unknown) => { if (settled) return; settled = true; clearTimeout(timer); reject(error instanceof Error ? error : new Error('failed')); },
    );
  });
}
