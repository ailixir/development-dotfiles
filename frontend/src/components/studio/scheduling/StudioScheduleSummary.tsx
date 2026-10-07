import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { StudioSchedule } from '@/types/studio/studioScheduling';
import { scheduleLabel, SCHEDULE_CHANGED_EVENT } from './schedulePresentation';

/** Reads only mounted/current-page tests. Cleanup aborts requests; old responses never replace another test. */
export function StudioScheduleSummary({ testId, refreshToken }: { testId: string; refreshToken?: string }) {
  const [schedule, setSchedule] = useState<StudioSchedule | null>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'unavailable'>('loading');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ testId: string }>).detail?.testId === testId) setRefresh(value => value + 1);
    };
    window.addEventListener(SCHEDULE_CHANGED_EVENT, changed);
    return () => window.removeEventListener(SCHEDULE_CHANGED_EVENT, changed);
  }, [testId]);
  useEffect(() => {
    const abort = new AbortController();
    setState('loading');
    studioSchedulesApi.get(testId, abort.signal).then(value => {
      if (!abort.signal.aborted) { setSchedule(value); setState('loaded'); }
    }).catch(() => { if (!abort.signal.aborted) setState('unavailable'); });
    return () => abort.abort();
  }, [testId, refresh, refreshToken]);
  return <Typography variant="caption" component="div" color="text.secondary" data-testid={`schedule-summary-${testId}`}>
    {state === 'loaded' ? (schedule?.state === 'ENABLED' && !schedule.unacknowledgedUncertaintyExecutionIds.length
      ? 'Schedule: Enabled intent · availability checked when managing'
      : `Schedule: ${scheduleLabel(schedule)}`) : state === 'loading' ? 'Loading schedule…' : 'Schedule unavailable'}
  </Typography>;
}
