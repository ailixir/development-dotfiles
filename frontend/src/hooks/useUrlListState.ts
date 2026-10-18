import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortDirection } from '@/types/studio/studioTypes';

/**
 * List state (search, filters, sort, page) kept in the URL query string (story 10.46, AC-1), so a
 * list is linkable and the back button restores it.
 *
 * URL shape: `?q=login&lastRun=FAILED&sort=name,asc&page=2&size=25`. Values equal to their default are
 * omitted, and parameters this hook does not own are preserved.
 *
 * History semantics:
 * - typing in the search box updates `q` after `debounceMs` with **replace** (no entry per key);
 * - filter, sort and page changes **push** a history entry, so Back undoes them;
 * - any change to `q`, a filter, the sort or the page size resets `page` to 1.
 */

/** The field part of a `field,direction` sort union. */
export type SortFieldOf<S extends string> = S extends `${infer F},${SortDirection}` ? F : never;

export interface UrlFilterSpec<V extends string> {
  /** The "no filter" value. Usually `''`. Omitted from the URL. */
  defaultValue: V;
  /** Accepted values. A URL value outside this list reads as `defaultValue`. Omit to accept any. */
  values?: readonly V[];
}

export interface UrlListStateConfig<F extends Record<string, string>, S extends string> {
  /** One spec per filter key; the key is also the URL parameter name. */
  filters: { [K in keyof F]: UrlFilterSpec<F[K]> };
  defaultSort: S;
  /** Narrows a URL value to the sort union; invalid values read as `defaultSort`. */
  isSort: (value: string) => value is S;
  /** Debounce for committing `q` to the URL. Default 300 ms. */
  debounceMs?: number;
  /** Rows per page when the URL has no valid `size`. Default 25. */
  defaultPageSize?: number;
}

export interface UrlListState<F extends Record<string, string>, S extends string> {
  /** The search box value; updates immediately. Bind this to the input. */
  query: string;
  /** The committed (debounced, trimmed) search term from the URL. Send this to the API. */
  debouncedQuery: string;
  setQuery: (value: string) => void;
  filters: F;
  setFilter: <K extends keyof F & string>(key: K, value: F[K]) => void;
  sort: S;
  sortField: SortFieldOf<S>;
  sortDirection: SortDirection;
  setSort: (sort: S) => void;
  /**
   * Header-click behaviour: the active field flips direction; another field becomes active with
   * `firstDirection` (default `asc`; pass `desc` for dates and durations).
   */
  toggleSort: (field: SortFieldOf<S>, firstDirection?: SortDirection) => void;
  /** 1-based, for MUI `Pagination`. Subtract 1 for the API. */
  page: number;
  /** Pushes a history entry; pass `{ replace: true }` for corrective moves Back must skip. */
  setPage: (page: number, options?: { replace?: boolean }) => void;
  /** Rows per page, from `size` (one of `PAGE_SIZE_OPTIONS` or the default). */
  pageSize: number;
  /** The choices for a rows-per-page selector, including the default. */
  pageSizeOptions: readonly number[];
  /** Pushes a history entry and resets the page. */
  setPageSize: (size: number) => void;
  /** True when `q` or any filter differs from its default (sort and page do not count). */
  hasActiveFilters: boolean;
  /** Clears `q` and every filter, keeps the sort, resets the page. Pushes a history entry. */
  clearAll: () => void;
}

const Q = 'q';
const SORT = 'sort';
const PAGE = 'page';
const SIZE = 'size';

/** Rows-per-page choices, as on the All Checks and All Reports lists. */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

function readPage(params: URLSearchParams): number {
  const raw = Number(params.get(PAGE));
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

function splitSort(sort: string): [string, SortDirection] {
  const [field, direction] = sort.split(',');
  return [field, direction === 'asc' ? 'asc' : 'desc'];
}

export function useUrlListState<F extends Record<string, string>, S extends string>(
  config: UrlListStateConfig<F, S>,
): UrlListState<F, S> {
  const { filters: filterSpecs, defaultSort, isSort, debounceMs = 300, defaultPageSize = 25 } = config;
  const [searchParams, setSearchParams] = useSearchParams();

  // Config objects are usually inline literals; key the memo on their serialised content.
  const specsRef = useRef(filterSpecs);
  specsRef.current = filterSpecs;
  const specsKey = JSON.stringify(filterSpecs);

  const urlQuery = (searchParams.get(Q) ?? '').trim();

  const filters = useMemo(() => {
    const result = {} as F;
    for (const key of Object.keys(specsRef.current) as (keyof F & string)[]) {
      const spec = specsRef.current[key];
      const raw = searchParams.get(key);
      const valid = raw !== null && (!spec.values || (spec.values as readonly string[]).includes(raw));
      result[key] = (valid ? raw : spec.defaultValue) as F[typeof key];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- specsKey stands in for the specs.
  }, [searchParams, specsKey]);

  const rawSort = searchParams.get(SORT);
  const sort: S = rawSort !== null && isSort(rawSort) ? rawSort : defaultSort;
  const [sortFieldRaw, sortDirection] = splitSort(sort);
  const sortField = sortFieldRaw as SortFieldOf<S>;
  const page = readPage(searchParams);
  const pageSizeOptions = useMemo(
    () => [...new Set([...PAGE_SIZE_OPTIONS, defaultPageSize])].sort((a, b) => a - b),
    [defaultPageSize],
  );
  const rawSize = Number(searchParams.get(SIZE));
  const pageSize = pageSizeOptions.includes(rawSize) ? rawSize : defaultPageSize;

  /** Applies `mutate` to a copy of the current params and commits it. */
  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, replace: boolean) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          mutate(next);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );
  // React Router's functional updater sees the params of the render that created it, so the
  // debounce timer must call the latest `update`, or it would drop a sort/filter set meanwhile.
  const updateRef = useRef(update);
  updateRef.current = update;

  // --- search box with debounce -------------------------------------------------------------
  const [query, setQueryState] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back/forward or another writer changed `q`: follow it unless the user is mid-typing.
  useEffect(() => {
    if (timer.current === null) setQueryState(urlQuery);
  }, [urlQuery]);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const setQuery = useCallback(
    (value: string) => {
      setQueryState(value);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const term = value.trim();
        updateRef.current((next) => {
          if ((next.get(Q) ?? '').trim() === term) return;
          if (term) next.set(Q, term);
          else next.delete(Q);
          next.delete(PAGE);
        }, true);
      }, debounceMs);
    },
    [debounceMs],
  );

  // --- filters, sort, page --------------------------------------------------------------------
  const setFilter = useCallback(
    <K extends keyof F & string>(key: K, value: F[K]) => {
      update((next) => {
        if (value === specsRef.current[key].defaultValue || value === '') next.delete(key);
        else next.set(key, value);
        next.delete(PAGE);
      }, false);
    },
    [update],
  );

  const setSort = useCallback(
    (nextSort: S) => {
      update((next) => {
        if (nextSort === defaultSort) next.delete(SORT);
        else next.set(SORT, nextSort);
        next.delete(PAGE);
      }, false);
    },
    [defaultSort, update],
  );

  const toggleSort = useCallback(
    (field: SortFieldOf<S>, firstDirection: SortDirection = 'asc') => {
      const direction: SortDirection =
        field === sortField ? (sortDirection === 'asc' ? 'desc' : 'asc') : firstDirection;
      setSort(`${field},${direction}` as S);
    },
    [setSort, sortDirection, sortField],
  );

  const setPage = useCallback(
    (nextPage: number, options?: { replace?: boolean }) => {
      update((next) => {
        if (!Number.isInteger(nextPage) || nextPage <= 1) next.delete(PAGE);
        else next.set(PAGE, String(nextPage));
      }, options?.replace ?? false);
    },
    [update],
  );

  const setPageSize = useCallback(
    (size: number) => {
      update((next) => {
        if (size === defaultPageSize || !pageSizeOptions.includes(size)) next.delete(SIZE);
        else next.set(SIZE, String(size));
        next.delete(PAGE);
      }, false);
    },
    [defaultPageSize, pageSizeOptions, update],
  );

  const clearAll = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setQueryState('');
    // Nothing to clear: no history entry, so Back keeps working as expected.
    const owned = [Q, PAGE, ...Object.keys(specsRef.current)];
    if (!owned.some((key) => searchParams.has(key))) return;
    update((next) => {
      for (const key of owned) next.delete(key);
    }, false);
  }, [searchParams, update]);

  const hasActiveFilters =
    urlQuery !== '' ||
    query.trim() !== '' ||
    (Object.keys(filters) as (keyof F)[]).some(
      (key) => filters[key] !== filterSpecs[key].defaultValue,
    );

  return {
    query,
    debouncedQuery: urlQuery,
    setQuery,
    filters,
    setFilter,
    sort,
    sortField,
    sortDirection,
    setSort,
    toggleSort,
    page,
    setPage,
    pageSize,
    pageSizeOptions,
    setPageSize,
    hasActiveFilters,
    clearAll,
  };
}

export default useUrlListState;
