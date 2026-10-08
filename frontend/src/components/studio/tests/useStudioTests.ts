import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { useAppSelector } from '@/store';
import { useUrlListState } from '@/hooks/useUrlListState';
import {
  DEFAULT_TEST_SORT,
  TEST_LAST_RUN_FILTERS,
  isTestSort,
  type TestDto,
  type TestLastRunFilter,
  type TestSort,
} from '@/types/studio/studioTypes';
import { STUDIO_TEST_ENVIRONMENTS } from './testListPresentation';

/**
 * Server-paged Studio tests list (story 10.46, Track C, AC-1).
 *
 * Search, the Last run and Environment filters, the sort and the page live in the URL through
 * `useUrlListState`; the global CSI and environment context come from the dashboard search context.
 * Every one of them is sent to `GET /studio/tests` — nothing is filtered on the client.
 *
 * Each request gets its own `AbortController`, and a sequence number drops any answer that is not
 * the latest, so a slow earlier response can never overwrite a newer one.
 */

export const TESTS_PAGE_SIZE = 10;

export type TestListFilters = {
  lastRun: '' | TestLastRunFilter;
  environment: string;
};

const LOAD_ERROR = 'Tests could not be loaded. Please try again.';

interface TestListData {
  tests: TestDto[];
  totalElements: number;
}

export function useStudioTests(defaultPageSize: number = TESTS_PAGE_SIZE) {
  const list = useUrlListState<TestListFilters, TestSort>({
    defaultPageSize,
    filters: {
      lastRun: { defaultValue: '', values: ['', ...TEST_LAST_RUN_FILTERS] },
      environment: { defaultValue: '', values: ['', ...STUDIO_TEST_ENVIRONMENTS] },
    },
    defaultSort: DEFAULT_TEST_SORT,
    isSort: isTestSort,
  });
  const [, setSearchParams] = useSearchParams();
  const searchContext = useAppSelector((state) => state.dashboard.searchContext);
  const globalCsiId = searchContext.csiId ?? undefined;
  const globalEnvironment = searchContext.environment ?? undefined;

  const [data, setData] = useState<TestListData>({ tests: [], totalElements: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const sequence = useRef(0);

  const { debouncedQuery, filters, sort, page, pageSize } = list;
  // A global environment pins the list; the local filter only applies without one.
  const environment = globalEnvironment ?? (filters.environment || undefined);

  /** Moves to `target` without a history entry, so Back never lands on a page that redirects. */
  const replacePage = useCallback(
    (target: number) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (target <= 1) next.delete('page');
          else next.set('page', String(target));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // The global context is not in the URL: when it changes, the current page number means nothing.
  const contextKey = `${globalCsiId ?? ''}|${globalEnvironment ?? ''}`;
  const previousContextKey = useRef(contextKey);
  useEffect(() => {
    if (previousContextKey.current === contextKey) return;
    previousContextKey.current = contextKey;
    if (page > 1) replacePage(1);
  }, [contextKey, page, replacePage]);

  useEffect(() => {
    const id = ++sequence.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    studioApi
      .listTests(
        {
          csiId: globalCsiId,
          environment,
          q: debouncedQuery || undefined,
          lastRun: filters.lastRun || undefined,
          sort,
          page: page - 1,
          size: pageSize,
        },
        { signal: controller.signal },
      )
      .then((result) => {
        if (controller.signal.aborted || id !== sequence.current) return;
        // The page emptied under us (last row deleted, or a stale link): fall back to the last page.
        if (result.data.length === 0 && page > 1) {
          // Always strictly lower than `page`, so this can never loop on the same page.
          replacePage(Math.max(1, Math.min(page - 1, result.totalPages)));
          return;
        }
        setData({ tests: result.data, totalElements: result.totalElements });
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || id !== sequence.current) return;
        console.error('Failed to load Studio tests:', failure);
        setError(LOAD_ERROR);
        setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, environment, filters.lastRun, globalCsiId, page, pageSize, replacePage, reloadToken, sort]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    ...list,
    tests: data.tests,
    totalElements: data.totalElements,
    loading,
    error,
    reload,
    globalCsiId: globalCsiId ?? null,
    globalEnvironment: globalEnvironment ?? null,
    /** Search, local filters or a global context narrow the list. */
    isNarrowed: list.hasActiveFilters || Boolean(globalCsiId) || Boolean(globalEnvironment),
  };
}
