import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import { useUiTestAvailability } from '@/hooks/useUiTestAvailability';
import type { TestDto } from '@/types/studio/studioTypes';

/**
 * The UI tests for All Checks: one availability-gated read of the Studio test list (spec 9.1).
 *
 * The server does the filtering (system, environment, search) and the sort; the client sees at most
 * one page of `UI_TEST_CATALOG_SIZE` tests plus the total, so the page can say when the list is cut.
 *
 * - Nothing is requested unless availability is 'on'. 'pending' and 'off' return an empty catalog
 *   without loading and without an error.
 * - The search text is debounced; system and environment changes go out at once. Each request has its
 *   own AbortController and a sequence number, so a superseded answer never overwrites a newer one.
 * - A failure leaves no UI test rows and sets `error`; `retry` asks again.
 */

/** Rows asked for from the server; the cap notice compares the total against it. */
export const UI_TEST_CATALOG_SIZE = 100;

/** How long the search text must rest before a request goes out (plan constant, owned by this hook). */
const SEARCH_DEBOUNCE_MS = 300;

const LOAD_ERROR = 'UI tests could not be loaded';

export interface UiTestCatalogQuery {
  /** The global system (CSI) scope; empty means all systems. */
  csiId?: string | null;
  /** The global environment scope; empty means all environments. */
  environment?: string | null;
  /** The All Checks search text, sent to the server as `q`. */
  q?: string;
}

export interface UiTestCatalog {
  tests: TestDto[];
  /** The server's total for the filters, which may exceed `tests.length`. */
  totalElements: number;
  loading: boolean;
  /** Set when the last request failed; `null` otherwise. */
  error: string | null;
  /** Sends the same request again. */
  retry: () => void;
}

interface CatalogData {
  tests: TestDto[];
  totalElements: number;
}

const EMPTY: CatalogData = { tests: [], totalElements: 0 };

function blankToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function useUiTestCatalog({ csiId, environment, q }: UiTestCatalogQuery = {}): UiTestCatalog {
  const availability = useUiTestAvailability();
  const enabled = availability === 'on';

  const csi = blankToUndefined(csiId);
  const env = blankToUndefined(environment);
  const search = q?.trim() ?? '';

  const [settledSearch, setSettledSearch] = useState(search);
  useEffect(() => {
    if (search === settledSearch) return undefined;
    const timer = setTimeout(() => setSettledSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, settledSearch]);

  const [data, setData] = useState<CatalogData>(EMPTY);
  // Starts loading so the first 'on' render is never mistaken for an empty catalog.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled) {
      // Back to the pre-request state, so a later 'on' starts from loading rather than stale rows.
      setData(EMPTY);
      setLoading(true);
      setError(null);
      return undefined;
    }
    const id = ++sequence.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    studioApi
      .listTests(
        {
          csiId: csi,
          environment: env,
          q: settledSearch || undefined,
          sort: 'updatedAt,desc',
          size: UI_TEST_CATALOG_SIZE,
        },
        { signal: controller.signal },
      )
      .then((page) => {
        if (controller.signal.aborted || id !== sequence.current) return;
        setData({ tests: page.data, totalElements: page.totalElements });
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || id !== sequence.current) return;
        console.error('Failed to load UI tests for All Checks:', failure);
        setData(EMPTY);
        setError(LOAD_ERROR);
        setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, csi, env, settledSearch, reloadToken]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  if (!enabled) return { tests: EMPTY.tests, totalElements: 0, loading: false, error: null, retry };
  return { tests: data.tests, totalElements: data.totalElements, loading, error, retry };
}
