import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { isUnavailableTestRead } from '@/components/studio/StudioUnavailable';
import type { TestDetailDto } from '@/types/studio/studioTypes';

/**
 * The read behind the UI test detail routes (spec §8.1) and the contract the page shell hands to the
 * parts that render inside it.
 *
 * ## Contract for the parts of the detail page (tasks 2.6, 2.7, 2.8)
 *
 * `UiTestDetailsPage` is the layout route of `ui-tests/:id`. It reads `GET /studio/tests/{id}` first and
 * renders nothing from the test, its runs or its drawer until that read succeeds. Everything below is
 * therefore mounted only with a successfully read test.
 *
 * - Header (2.6): `UiTestDetailHeader`, a default-less named export taking `UiTestDetailHeaderProps`
 *   (= `UiTestDetailContext`) as props. The shell mounts it at the marked slot in `UiTestDetailsPage.tsx`.
 * - Overview tab (2.7): `UiTestOverviewTab`, a props-less component that is the index child route of
 *   `ui-tests/:id`. It reads the shell's context with `useUiTestDetailContext()`.
 * - Runs tab (2.8): `UiTestRunsTab`, a props-less component that is the child route of both
 *   `ui-tests/:id/runs` and `ui-tests/:id/runs/:executionId`. It reads the shell's context with
 *   `useUiTestDetailContext()` and the drawer's run from `useParams().executionId`.
 *
 * A part must not call `GET /studio/tests/{id}` itself, must not read the test id from anywhere but the
 * context, and must not call `/checks/{id}`. To show fresh data after a write (a schedule saved, a test
 * edited), call `refresh()` from the context; `test` is replaced when the re-read succeeds.
 */

/** The tabs the shell owns. The route selects the tab; the tabs never select themselves. */
export type UiTestDetailTab = 'overview' | 'runs';

/**
 * The tab a pathname belongs to: `runs` under `ui-tests/{id}/runs[/{executionId}]`, otherwise `overview`.
 * It looks at the segment after the `ui-tests/{id}` pair only, so it holds under any module base.
 */
export function uiTestDetailTab(pathname: string): UiTestDetailTab {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.indexOf('ui-tests');
  return at >= 0 && segments[at + 2] === 'runs' ? 'runs' : 'overview';
}

/**
 * What the shell provides, through the Outlet context to the tabs and as props to the header. A
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
}

/** The header takes the whole context as its props. */
export type UiTestDetailHeaderProps = UiTestDetailContext;

/** The shell's context inside a tab. Throws when the tab is mounted outside `UiTestDetailsPage`. */
export function useUiTestDetailContext(): UiTestDetailContext {
  const context = useOutletContext<UiTestDetailContext | undefined>();
  if (!context) throw new Error('useUiTestDetailContext must be used inside UiTestDetailsPage');
  return context;
}

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
