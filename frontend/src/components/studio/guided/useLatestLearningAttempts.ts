import { useCallback, useEffect, useMemo, useState } from 'react';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import type { GuidedLatestAttempt } from '@/types/studio/studioGuidedTypes';

/**
 * The caller's latest terminal learning attempt per test (STUDIO-UNIFY-001.6 AC-04, AC-09, AC-10),
 * read once from `GET /studio/guided-sessions/latest` through the API client.
 *
 *  - It reads once on mount and again only when the set of ids changes (order and duplicates do not
 *    count) or when `refresh()` is called. There is no polling, and nothing is stored in
 *    `localStorage`, `sessionStorage` or any other client store.
 *  - A superseded or unmounted read is aborted with an `AbortSignal`; the API client rejects a
 *    cancelled call quietly (story .5) and this hook ignores its result.
 *  - A failed read is an empty map. The line the attempt drives shows nothing and no error, so the
 *    hook neither surfaces nor logs the failure.
 *  - An empty id list sends no request.
 *  - `refresh()` keeps the earlier answer on screen until the new one arrives, so a page that
 *    refreshes after a guided session ends does not flicker.
 *  - Ids are the UUIDs of persisted tests; the route takes at most 50 per request and the client
 *    splits a longer list into chunks.
 */
export interface UseLatestLearningAttemptsResult {
  /** The latest terminal attempt by test id; a test with none, or while loading, is absent. */
  readonly byTestId: ReadonlyMap<string, GuidedLatestAttempt>;
  /** Reads again now (for example once a guided session on this page reaches a terminal state). */
  readonly refresh: () => void;
}

const NONE: ReadonlyMap<string, GuidedLatestAttempt> = new Map();

export function useLatestLearningAttempts(
  testIds: readonly string[],
): UseLatestLearningAttemptsResult {
  // The id set as one stable string: a new array with the same ids does not read again.
  const idKey = useMemo(() => [...new Set(testIds)].sort().join(','), [testIds]);
  const [answer, setAnswer] = useState<ReadonlyMap<string, GuidedLatestAttempt>>(NONE);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const ids = idKey === '' ? [] : idKey.split(',');
    if (ids.length === 0) {
      setAnswer(NONE);
      return undefined;
    }
    const controller = new AbortController();
    studioGuidedApi
      .readLatestAttempts(ids, { signal: controller.signal })
      .then((attempts) => {
        if (controller.signal.aborted) return;
        setAnswer(new Map(attempts.map((attempt) => [attempt.testId, attempt])));
      })
      .catch(() => {
        // A cancel is the caller's own decision; any other failure shows nothing (AC-04).
        if (!controller.signal.aborted) setAnswer(NONE);
      });
    return () => controller.abort();
  }, [idKey, generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  // An answer for ids the page no longer asks about is not shown while the new read is in flight.
  const byTestId = useMemo(() => {
    if (answer.size === 0 || idKey === '') return NONE;
    const asked = new Set(idKey.split(','));
    const visible = new Map([...answer].filter(([testId]) => asked.has(testId)));
    return visible.size === answer.size ? answer : visible;
  }, [answer, idKey]);

  return { byTestId, refresh };
}

export default useLatestLearningAttempts;
