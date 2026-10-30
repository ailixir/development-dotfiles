import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import { isUnavailableTestRead } from '@/components/studio/StudioUnavailable';
import type { TestDetailDto } from '@/types/studio/studioTypes';

/**
 * The read behind the UI test detail routes (spec §8.1) and the contract the page shell hands to the
 * parts that render inside it (STUDIO-UNIFY-001.7).
 *
 * ## Contract for the parts of the detail page
 *
 * `UiTestDetailsPage` is the route element of `ui-tests/:id` and of its drawer URL
 * `ui-tests/:id/runs/:executionId`. It reads `GET /studio/tests/{id}` first and renders nothing from the
 * test, its runs or its drawer until that read succeeds. Everything below is therefore mounted only with
 * a successfully read test, and the shell only lays the parts out.
 *
 * - Header: `UiTestDetailHeader`, taking `UiTestDetailHeaderProps` (= `UiTestDetailContext`) as props.
 * - Overview: `UiTestOverviewCard({ test, schedule })`. It shows the shell's test and
 *   schedule and does not read either. The schedule is the test's shared `/api/v1/schedules` row.
 * - Recent Runs: `UiTestRecentRunsCard({ testId })`. It reads this test's replays, and owns the run
 *   drawer (the run in the URL is read with `useParams().executionId`).
 * - Latest run: `UiTestLatestRunCard({ testId, onRunTerminal? })`. It reads this test's newest replay and
 *   calls `refresh()` (through `onRunTerminal`) once when it sees a run go from live to terminal.
 *
 * A part must not call `GET /studio/tests/{id}` itself, must not read the test id from anywhere but the
 * props, and must not call `/checks/{id}`. To show fresh data after a write, call `refresh()` for a test
 * edit (`test` is replaced when the re-read succeeds) or `reloadSchedule()` after a schedule save.
 */

/**
 * What the shell reads and hands to its parts (the header takes it as props). A
 * `UiTestDetailContext` only ever exists for a test the caller was allowed to read.
 */
export interface UiTestDetailContext {
  /** The route id the test was read for. Equals `test.id`. */
  readonly testId: string;
  /** The test as last read: header fields plus steps, variables, readiness and revisions. */
  readonly test: TestDetailDto;
  /**
   * Reads the test again and replaces `test` when it succeeds. It never rejects and never blanks the
   * page: a failed re-read keeps the current `test`, except a 403 or 400, which turns the page into the
   * single not-available message.
   */
  readonly refresh: () => Promise<void>;
  /** Reads the test's shared schedule again, for the Overview card, after the schedule dialog saved. */
  readonly reloadSchedule: () => Promise<void>;
}

/** The header takes the whole context as its props. */
export type UiTestDetailHeaderProps = UiTestDetailContext;

type TestRead =
  | { readonly testId: string; readonly status: 'ready'; readonly test: TestDetailDto }
  | { readonly testId: string; readonly status: 'unavailable' }
  | { readonly testId: string; readonly status: 'error' };

/**
 * `idle`: no request was or will be sent (availability is not 'on', or there is no id).
 * `loading`: the read is in flight. `unavailable`: 403 or 400. `error`: any other failure.
 */
export type UiTestDetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly test: TestDetailDto };

export interface UiTestDetail {
  readonly state: UiTestDetailState;
  /** Repeats the read after a load error; the page shows the loading state meanwhile. */
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/**
 * Reads `GET /studio/tests/{testId}` once `enabled` is true (the shell passes `availability === 'on'`),
 * and never before: while `enabled` is false no request is sent. A different id, or `enabled` going
 * false, drops the previous result at once, so a test is never shown for another id or before its read.
 */
export function useUiTestDetail(testId: string | undefined, enabled: boolean): UiTestDetail {
  const [read, setRead] = useState<TestRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Bumped whenever a result may no longer belong to the page (new read, id change, unmount).
  const generation = useRef(0);

  useEffect(() => {
    if (!enabled || !testId) return undefined;
    generation.current += 1;
    const mine = generation.current;
    setRead(null);
    studioApi.getTest(testId).then(
      (test) => {
        if (generation.current === mine) setRead({ testId, status: 'ready', test });
      },
      (error: unknown) => {
        if (generation.current === mine) {
          setRead({ testId, status: isUnavailableTestRead(error) ? 'unavailable' : 'error' });
        }
      },
    );
    return () => {
      generation.current += 1;
    };
  }, [testId, enabled, attempt]);

  const retry = useCallback(() => {
    setRead(null);
    setAttempt((n) => n + 1);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!testId) return;
    const mine = generation.current;
    try {
      const test = await studioApi.getTest(testId);
      if (generation.current === mine) setRead({ testId, status: 'ready', test });
    } catch (error) {
      if (generation.current === mine && isUnavailableTestRead(error)) {
        setRead({ testId, status: 'unavailable' });
      }
    }
  }, [testId]);

  let state: UiTestDetailState;
  if (!enabled || !testId) state = { status: 'idle' };
  else if (!read || read.testId !== testId) state = { status: 'loading' };
  else if (read.status === 'ready') state = { status: 'ready', test: read.test };
  else state = { status: read.status };

  return { state, retry, refresh };
}
