import { useCallback, useEffect, useRef, useState } from 'react';
import { mapScheduleDtoToCheckSchedule } from '@/services/api/mappers/scheduleMapper';
import { schedulesApi } from '@/services/api/schedulesApi';
import type { CheckSchedule } from '@/types/checks/checkTypes';

/** A UI test's shared schedule as the schedule UI shows it. */
export type UiTestScheduleView = CheckSchedule & { id: string; nextExecutionAt: string | null };

export interface UiTestScheduleState {
  /** `loading` until the first answer; `error` when the read failed (no schedule is claimed then). */
  readonly status: 'loading' | 'ready' | 'error';
  /** The test's schedule, or null when it has none (or the read failed). */
  readonly schedule: UiTestScheduleView | null;
  /** Reads the schedule again and replaces it; never rejects. */
  readonly reload: () => Promise<void>;
}

/**
 * Reads the shared schedule of one UI test (`GET /api/v1/schedules?uiTestId=`), the same endpoint and
 * mapping a check's schedule goes through. A test has at most one schedule.
 */
export function useUiTestSchedule(testId: string | undefined): UiTestScheduleState {
  const [state, setState] = useState<{ testId: string | undefined; status: 'ready' | 'error'; schedule: UiTestScheduleView | null } | null>(null);
  // Bumped whenever an answer may no longer belong to this test (new read, id change, unmount).
  const generation = useRef(0);

  const read = useCallback(async (): Promise<void> => {
    if (!testId) return;
    generation.current += 1;
    const mine = generation.current;
    try {
      const page = await schedulesApi.list({ uiTestId: testId, limit: 1 });
      const dto = page.data?.[0];
      if (generation.current === mine) {
        setState({ testId, status: 'ready', schedule: dto ? mapScheduleDtoToCheckSchedule(dto) : null });
      }
    } catch {
      if (generation.current === mine) setState({ testId, status: 'error', schedule: null });
    }
  }, [testId]);

  useEffect(() => {
    setState(null);
    void read();
    return () => {
      generation.current += 1;
    };
  }, [read]);

  const current = state && state.testId === testId ? state : null;
  return {
    status: current ? current.status : 'loading',
    schedule: current ? current.schedule : null,
    reload: read,
  };
}
