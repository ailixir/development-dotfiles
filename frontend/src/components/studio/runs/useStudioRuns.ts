import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import type {
  ExecutionListQuery,
  ExecutionSnapshot,
  ExecutionSort,
  ExecutionStatusFilter,
} from '@/types/studio/studioTypes';
import { applyRunSnapshot, mergeRunsByRevision } from './runSnapshots';

export const RUNS_LOAD_ERROR = 'Runs could not be loaded. Please try again.';

export interface StudioRunsQuery {
  /** Committed search term (debounced). */
  q: string;
  status: ExecutionStatusFilter | '';
  csiId: string | null;
  sort: ExecutionSort;
  /** 1-based, as in the URL. */
  page: number;
  pageSize: number;
}

export interface ReloadOptions {
  /**
   * A background refresh (live polling): keeps the current rows undimmed and a failure does not
   * replace them with an error, so a transient blip never blanks the list.
   */
  silent?: boolean;
}

export interface StudioRunsState {
  runs: ExecutionSnapshot[];
  totalElements: number;
  /** True while a user-visible load is in flight. Background refreshes do not set it. */
  loading: boolean;
  error: string | null;
  /** Runs currently `RUNNING` in the selected CSI scope; null until known. */
  runningCount: number | null;
  reload: (options?: ReloadOptions) => Promise<void>;
  /** Merges a live snapshot (e.g. from the drawer's subscription) into the visible page. */
  applySnapshot: (snapshot: ExecutionSnapshot) => void;
}

/**
 * Server-paged run history (story 10.46, AC-1/AC-2).
 *
 * Every load aborts the one before it and a response is applied only if it is still the latest
 * request, so a slow page never lands on top of a newer one. Rows are merged by `revision`, so a
 * refresh never replaces a newer snapshot of a run with an older one.
 */
export function useStudioRuns(query: StudioRunsQuery): StudioRunsState {
  const { q, status, csiId, sort, page, pageSize } = query;
  const [runs, setRuns] = useState<ExecutionSnapshot[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningCount, setRunningCount] = useState<number | null>(null);
  const sequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(
    async ({ silent = false }: ReloadOptions = {}) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const id = ++sequence.current;
      const isCurrent = () => id === sequence.current && !controller.signal.aborted;

      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const params: ExecutionListQuery = {
        q: q || undefined,
        status: status || undefined,
        csiId: csiId ?? undefined,
        sort,
        page: Math.max(0, page - 1),
        size: pageSize,
      };
      // The header count is secondary: its failure never affects the list.
      const running = studioApi
        .listExecutions({ status: 'RUNNING', size: 1, csiId: csiId ?? undefined }, { signal: controller.signal })
        .then((result) => result.totalElements)
        .catch(() => null);

      try {
        const result = await studioApi.listExecutions(params, { signal: controller.signal });
        if (!isCurrent()) return;
        setRuns((previous) => mergeRunsByRevision(previous, result.data));
        setTotalElements(result.totalElements);
        setError(null);
      } catch (failure) {
        if (!isCurrent()) return;
        if (!silent) {
          console.error('Studio runs: list request failed', failure);
          setError(RUNS_LOAD_ERROR);
        }
      } finally {
        if (id === sequence.current) setLoading(false);
      }

      const count = await running;
      if (isCurrent() && count !== null) setRunningCount(count);
    },
    [q, status, csiId, sort, page, pageSize],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(
    () => () => {
      sequence.current += 1;
      controllerRef.current?.abort();
    },
    [],
  );

  const applySnapshot = useCallback((snapshot: ExecutionSnapshot) => {
    setRuns((current) => applyRunSnapshot(current, snapshot));
  }, []);

  return { runs, totalElements, loading, error, runningCount, reload, applySnapshot };
}

export default useStudioRuns;
