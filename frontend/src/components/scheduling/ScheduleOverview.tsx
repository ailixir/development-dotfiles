import React from 'react';
import { Typography } from '@mui/material';
import type { CheckSchedule } from '../../types/checks/checkTypes';
import { formatNextCronRun, parseCron } from '@/utils/cronNextRun';

export interface ScheduleOverviewProps {
  schedule: CheckSchedule | null | undefined;
  /** The server's next run for the schedule (ISO), when it has one. */
  nextExecution: string | null | undefined;
}

/**
 * The Schedule / Cron / Next run lines of an Overview card. A check's detail page and a UI test's
 * detail page show the same three lines for the same kind of schedule, so they render this.
 */
const ScheduleOverview: React.FC<ScheduleOverviewProps> = ({ schedule, nextExecution }) => (
  <>
    <Typography variant="body2">
      Schedule:{' '}
      {schedule?.enabled
        ? schedule.frequency
          ? schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)
          : '—'
        : 'Disabled'}
    </Typography>
    {schedule?.cron && <Typography variant="body2">Cron: {schedule.cron}</Typography>}
    <Typography variant="body2">
      Next run:{' '}
      {nextExecution
        ? new Date(nextExecution).toLocaleString()
        : schedule?.cron && parseCron(schedule.cron)
          ? formatNextCronRun(schedule.cron)
          : '—'}
    </Typography>
  </>
);

export default ScheduleOverview;
