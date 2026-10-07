import { dedupeById } from '@/services/api/studioApi';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';

/** Statuses for which a run is still moving and the list keeps watching it. */
export function isActiveRunStatus(status: string): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

/**
 * The newer of two snapshots of the same run, by the server's monotonic `revision` (AC-2/AC-3).
 *
 * SSE snapshots do not always carry `testName`; when the newer one leaves it `undefined`, the name
 * already known from the list is kept. `null` (soft-deleted test) is a real value and wins.
 */
export function newerSnapshot(
  current: ExecutionSnapshot | null | undefined,
  incoming: ExecutionSnapshot | null | undefined,
): ExecutionSnapshot | null {
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  if (incoming.revision < current.revision) return current;
  if (incoming.revision === current.revision && incoming.testName === undefined) return current;
  return incoming.testName === undefined && current.testName !== undefined
    ? { ...incoming, testName: current.testName }
    : incoming;
}

/**
 * Replaces the list with a fresh server page, deduped by id, but never lets an older snapshot of a
 * run overwrite a newer one already on screen (e.g. one the drawer received live).
 */
export function mergeRunsByRevision(
  previous: readonly ExecutionSnapshot[],
  next: readonly ExecutionSnapshot[],
): ExecutionSnapshot[] {
  const known = new Map(previous.map((run) => [run.executionId, run]));
  return dedupeById(next, (run) => run.executionId).map(
    (run) => newerSnapshot(known.get(run.executionId), run) ?? run,
  );
}

/** Applies one snapshot to the list if that run is on it and the snapshot is newer. */
export function applyRunSnapshot(
  runs: readonly ExecutionSnapshot[],
  snapshot: ExecutionSnapshot,
): ExecutionSnapshot[] {
  let changed = false;
  const result = runs.map((run) => {
    if (run.executionId !== snapshot.executionId) return run;
    const merged = newerSnapshot(run, snapshot) ?? run;
    if (merged !== run) changed = true;
    return merged;
  });
  return changed ? result : (runs as ExecutionSnapshot[]);
}
