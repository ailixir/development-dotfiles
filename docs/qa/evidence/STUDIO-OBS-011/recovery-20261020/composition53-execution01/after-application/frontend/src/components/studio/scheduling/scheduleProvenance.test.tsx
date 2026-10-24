import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Table, TableBody } from '@mui/material';
import { describe, expect, it } from 'vitest';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import { RunRow } from '@/components/studio/runs/RunRow';
import { RunDetailsDrawer } from '@/components/studio/runs/RunDetailsDrawer';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { occurrenceLabel } from './schedulePresentation';
import type { ScheduleOccurrence } from '@/types/studio/studioScheduling';

const known = mockExecutions.find(run => run.status === 'PASSED')!;
const scheduled: ExecutionSnapshot = { ...known, triggerSource: 'SCHEDULED', scheduleId: 'schedule-old', scheduleVersion: 2,
  occurrenceId: 'occurrence-old', scheduledAt: '2026-10-01T12:00:00Z', activationId: 'activation-old',
  activatedBy: 'original.operator@citi.com', activatedAt: '2026-09-30T12:00:00Z' };

describe('Scheduling evidence presentation', () => {
  it('rows distinguish explicit scheduled source from unknown legacy source', () => {
    render(<MemoryRouter><Table><TableBody>
      <RunRow run={scheduled} href="/studio/runs/one" onOpenRun={() => undefined} onCopyLink={() => undefined} />
      <RunRow run={{ ...known, executionId: 'legacy', triggerSource: undefined }} href="/studio/runs/legacy" onOpenRun={() => undefined} onCopyLink={() => undefined} />
    </TableBody></Table></MemoryRouter>);
    expect(screen.getByText(/· Scheduled/)).toBeInTheDocument();
    expect(screen.getByText(/· Unknown origin/)).toBeInTheDocument();
  });
  it('run details retain the actual activation actor and accepted revision', () => {
    render(<MemoryRouter><RunDetailsDrawer executionId={scheduled.executionId} pageRuns={[scheduled]} onClose={() => undefined}
      onNavigateRun={() => undefined} onCopyLink={() => undefined} testHref={id => `/studio/${id}`} /></MemoryRouter>);
    expect(screen.getByTestId('run-schedule-provenance')).toHaveTextContent('original.operator@citi.com');
    expect(screen.getByTestId('run-schedule-provenance')).toHaveTextContent(`Learned revision: ${scheduled.revisionId}`);
    expect(screen.getByTestId('run-schedule-provenance')).toHaveTextContent('activation-old');
  });
  it('expired deferred work is awaiting settlement, including while capability is off', () => {
    const row = { decision: 'DEFERRED', code: 'PENDING_QUOTA_EXCEEDED', graceExpiresAt: '2026-10-05T12:00:00Z' } as ScheduleOccurrence;
    expect(occurrenceLabel(row, null, Date.parse('2026-10-05T12:00:00Z'))).toBe('Grace expired; awaiting scheduler settlement');
    const capabilities = { enabled: false, canManage: false, availableExecutionPrincipals: [], localAuthorizationOnly: false,
      policy: { minIntervalSeconds: 60, misfireGraceSeconds: 300, overlap: 'SKIP' as const, dstOverlap: 'EARLIER_OFFSET' as const } };
    expect(occurrenceLabel(row, capabilities, Date.parse('2026-10-05T11:59:59Z'))).toBe('Scheduling disabled · occurrence suspended');
    expect(occurrenceLabel(row, capabilities, Date.parse('2026-10-05T12:00:01Z'))).toBe('Grace expired; awaiting scheduler settlement');
  });
});
