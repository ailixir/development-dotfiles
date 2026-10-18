import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import { createSchedulingHandlers, seedScheduleOccurrences } from '@/services/mocks/studio/schedulingHandlers';
import { MOCK_SCHEDULE_POLICY } from '@/services/mocks/studio/schedulePreview';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { ScheduleEnable, ScheduleOccurrence } from '@/types/studio/studioScheduling';
import axe from 'axe-core';
import { useState } from 'react';
import { Table, TableBody } from '@mui/material';
import TestRow from '@/components/studio/tests/TestRow';
import type { ExecutionSnapshot, TestDto } from '@/types/studio/studioTypes';
import { StudioScheduleSummary } from './StudioScheduleSummary';
import { StudioScheduleDialog } from './StudioScheduleDialog';
import { scheduleError } from './schedulePresentation';

const BASE = '*/api/v1/studio';
const write = { cronExpression: '0 */5 * * * *', timeZone: 'UTC', executionPrincipal: 'studio-local' };
const create = () => studioSchedulesApi.create(readyDraft.id, write);
const user = () => userEvent.setup({ delay: null });
const renderDialog = (dirty = false, entry = '/checks/studio/tests') => render(<MemoryRouter initialEntries={[entry]}><StudioScheduleDialog test={readyDraft} dirty={dirty} onClose={() => undefined} /></MemoryRouter>);
const loaded = async () => {
  await screen.findByLabelText('Cron expression');
  await waitFor(() => expect(screen.queryByText('Calculating next runs…')).not.toBeInTheDocument());
};
beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { studioMockServer.resetHandlers(); resetStudioMocks(); });
afterAll(() => studioMockServer.close());

describe('STUDIO-OBS-012B COPY-002/COPY-003: schedule refusal copy uses learn vocabulary and stays true in the interim build', () => {
  const messageFor = (code: string) => scheduleError({ response: { status: 409, data: { code } } }).message;
  it('LEARN_REQUIRED, RUNTIME_INCOMPATIBLE and ACTIVATION_REVISION_MISMATCH read as the UX gate worded them', () => {
    expect(messageFor('LEARN_REQUIRED')).toBe('The saved steps are not learned yet. Once a Run has learned them, reload and explicitly resume the schedule.');
    expect(messageFor('RUNTIME_INCOMPATIBLE')).toBe('The runtime changed, so the steps must be learned again. Once a Run has relearned them, reload and explicitly resume the schedule.');
    expect(messageFor('ACTIVATION_REVISION_MISMATCH')).toBe('The learned steps changed. Reload and review them before resuming.');
    for (const code of ['LEARN_REQUIRED', 'RUNTIME_INCOMPATIBLE', 'ACTIVATION_REVISION_MISMATCH']) {
      // No instruction to press Run (disabled for every non-READY state) and no compile-review word.
      expect(messageFor(code), code).not.toMatch(/with Run|confirm|compil|prepar/i);
    }
  });
});

describe('Studio schedule operator flows', { timeout: 15000 }, () => {
  it('opens from the test row menu and returns focus to the row action after closing', async () => {
    function RowFlow() {
      const [target, setTarget] = useState<TestDto | null>(null);
      return <><Table><TableBody><TestRow test={readyDraft} now={Date.now()} onDelete={() => undefined} onSchedule={setTarget} /></TableBody></Table>
        <StudioScheduleDialog test={target} onClose={() => setTarget(null)} /></>;
    }
    render(<MemoryRouter initialEntries={['/checks/studio/tests']}><RowFlow /></MemoryRouter>);
    const actions = screen.getByRole('button', { name: `Actions for ${readyDraft.name}` });
    await user().click(actions);
    await user().click(screen.getByRole('menuitem', { name: 'Manage schedule' }));
    await loaded();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(actions).toHaveFocus());
  });
  it('shows five due slots, creates Paused and explicitly resumes the exact confirmed revision by keyboard', async () => {
    const mutations: ScheduleEnable[] = [];
    studioMockServer.use(http.patch(`${BASE}/tests/:id/schedule/enabled`, async ({ request }) => {
      mutations.push(await request.clone().json() as ScheduleEnable); return undefined;
    }));
    renderDialog(); await loaded();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'studio-schedule-title');
    expect(screen.getByText(/Local authorization only/)).toBeInTheDocument();
    expect(await screen.findAllByRole('listitem')).toHaveLength(5);
    const createButton = screen.getByRole('button', { name: 'Create paused schedule' });
    createButton.focus(); await user().keyboard('{Enter}');
    await screen.findByText('Schedule: Paused');
    expect(mutations).toEqual([]);
    const resume = screen.getByRole('button', { name: 'Resume schedule' });
    resume.focus(); await user().keyboard('{Enter}');
    await screen.findByText('Schedule: Active');
    expect(mutations[0]).toEqual({ expectedVersion: 1, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId, acknowledgedUncertaintyExecutionIds: [] });
    expect((await studioSchedulesApi.get(readyDraft.id))?.activationId).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent('Schedule resumed for future slots.');
  });

  it('dirty authoring blocks create and Resume, while Pause ignores an invalid unsaved cron', async () => {
    const s = await create();
    await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: s.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
    renderDialog(true); await loaded();
    const input = screen.getByLabelText('Cron expression');
    await user().clear(input); await user().type(input, 'invalid');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user().click(screen.getByRole('button', { name: 'Pause schedule' }));
    await screen.findByText('Schedule: Paused');
    expect(screen.getByRole('button', { name: 'Resume schedule' })).toBeDisabled();
    expect((await studioSchedulesApi.get(readyDraft.id))?.cronExpression).toBe(write.cronExpression);
  });

  it('an enabled schedule blocked by executable edits can still be explicitly paused', async () => {
    let saved = { ...readyDraft };
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => saved, getExecutions: () => [] }));
    const s = await create();
    await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: s.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
    saved = { ...saved, sourceRevision: saved.sourceRevision + 1, readiness: 'UNLEARNED' };
    renderDialog(); await loaded();
    expect(screen.getByText(/Schedule: Blocked/)).toBeInTheDocument();
    // STUDIO-OBS-012B COPY-002: conditional wording, never an instruction to press a Run this build disables.
    expect(screen.getByText('If the saved steps need learning, resume only after a Run has learned them: reload, then explicitly Resume. Learning alone does not restart scheduling.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume schedule' })).toBeDisabled();
    await user().click(screen.getByRole('button', { name: 'Pause schedule' }));
    await screen.findByText('Schedule: Paused');
    expect((await studioSchedulesApi.get(readyDraft.id))?.requestedEnabled).toBe(false);
  });

  it('STUDIO-OBS-012B COPY-002: a never-learned test says Resume waits for a learning Run, without sending the author to Run', async () => {
    const neverLearned: TestDto = { ...readyDraft, confirmedRevisionId: null, readiness: 'UNLEARNED' };
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => neverLearned, getExecutions: () => [] }),
      http.get(`${BASE}/tests/:id`, () => HttpResponse.json(neverLearned)));
    renderDialog(); await loaded();
    expect(screen.getByText('Resume becomes available once a Run has learned the saved steps.')).toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/with Run/);
  });

  it('preserves edits on version conflict and reloads only when the operator chooses', async () => {
    await create(); renderDialog(); await loaded();
    const input = screen.getByLabelText('Cron expression');
    await user().clear(input); await user().type(input, '0 */10 * * * *');
    await screen.findByText('Rule: 0 */10 * * * *');
    const save = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => expect(save).toBeEnabled());
    studioMockServer.use(http.put(`${BASE}/tests/:id/schedule`, () => HttpResponse.json({ code: 'SCHEDULE_VERSION_CONFLICT' }, { status: 409 })));
    await user().click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/changed since you opened it/);
    expect(input).toHaveValue('0 */10 * * * *');
    await user().click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByLabelText('Cron expression')).toHaveValue(write.cronExpression));
  });

  it('requires investigation acknowledgment for the exact uncertainty set before Resume', async () => {
    const uncertain = { ...mockExecutions[0], executionId: 'uncertain-start', testId: readyDraft.id, status: 'ERROR' as const, errorCode: 'START_TIMEOUT' as const };
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => readyDraft, getExecutions: () => [uncertain] }));
    await create(); renderDialog(); await loaded();
    const resume = screen.getByRole('button', { name: 'Resume schedule' });
    expect(resume).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Inspect run uncertain-start' })).toHaveAttribute('href', '/checks/studio/runs/uncertain-start');
    await user().click(screen.getByRole('checkbox', { name: /I investigated these uncertain runs/ }));
    await user().click(resume);
    await screen.findByText('Schedule: Active');
    expect((await studioSchedulesApi.get(readyDraft.id))?.unacknowledgedUncertaintyExecutionIds).toEqual([]);
  });

  it('new manual uncertainty blocks presentation before the producer updates ENABLED, and investigated Resume acknowledges the exact set', async () => {
    let executions: ExecutionSnapshot[] = [];
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => readyDraft, getExecutions: () => executions }));
    const created = await create();
    const active = await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: created.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
    executions = [{ ...mockExecutions[0], executionId: 'late-manual-uncertainty', testId: readyDraft.id, status: 'ERROR', errorCode: 'START_TIMEOUT' }];
    const before = await studioSchedulesApi.get(readyDraft.id);
    expect(before).toMatchObject({ state: 'ENABLED', requestedEnabled: true, blockedCode: null, version: active.version,
      unacknowledgedUncertaintyExecutionIds: ['late-manual-uncertainty'] });
    expect(Date.parse(before!.nextDueAt!)).toBeGreaterThan(Date.now());
    const mutations: ScheduleEnable[] = [];
    studioMockServer.use(http.patch(`${BASE}/tests/:id/schedule/enabled`, async ({ request }) => {
      mutations.push(await request.clone().json() as ScheduleEnable); return undefined;
    }));
    renderDialog(); await loaded();
    expect(screen.getByText('Schedule: Blocked · Previous run needs investigation')).toBeInTheDocument();
    expect(screen.queryByText(/Next scheduled due:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause schedule' })).toBeEnabled();
    const resume = screen.getByRole('button', { name: 'Resume schedule' });
    expect(resume).toBeDisabled();
    expect(mutations).toEqual([]);
    expect((await studioSchedulesApi.get(readyDraft.id))?.state).toBe('ENABLED');
    await user().click(screen.getByRole('checkbox', { name: /I investigated these uncertain runs/ }));
    const acknowledgedAt = Date.now();
    await user().click(resume);
    await screen.findByText('Schedule: Active');
    expect(mutations).toEqual([{ expectedVersion: active.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId,
      acknowledgedUncertaintyExecutionIds: ['late-manual-uncertainty'] }]);
    const resumed = await studioSchedulesApi.get(readyDraft.id);
    expect(resumed?.unacknowledgedUncertaintyExecutionIds).toEqual([]);
    expect(Date.parse(resumed!.nextDueAt!)).toBeGreaterThan(acknowledgedAt);
  });

  it('disabled scheduling remains readable and cannot advertise an available mutation', async () => {
    await create();
    studioMockServer.use(http.get(`${BASE}/tests/:id/schedule/capabilities`, () => HttpResponse.json({ enabled: false, canManage: true, availableExecutionPrincipals: [], localAuthorizationOnly: false, policy: MOCK_SCHEDULE_POLICY })));
    renderDialog(); await loaded();
    expect(screen.getByText(/Scheduling disabled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume schedule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove schedule' })).toBeDisabled();
    expect(screen.getByText(/No approved unattended execution identity/)).toBeInTheDocument();
  });

  it('list summary labels persisted enabled intent without implying that a disabled producer runs', async () => {
    const s = await create();
    await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: s.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
    let capabilityReads = 0;
    studioMockServer.use(http.get(`${BASE}/tests/:id/schedule/capabilities`, () => {
      capabilityReads += 1; return HttpResponse.json({ enabled: false });
    }));
    render(<StudioScheduleSummary testId={readyDraft.id} />);
    await screen.findByText('Schedule: Enabled intent · availability checked when managing');
    expect(screen.queryByText('Schedule: Active')).not.toBeInTheDocument();
    expect(capabilityReads).toBe(0);
  });

  it('summary distinguishes new uncertainty from enabled intent and preserves an explicitly Paused choice', async () => {
    let executions: ExecutionSnapshot[] = [];
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => readyDraft, getExecutions: () => executions }));
    const created = await create();
    const active = await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: created.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
    executions = [{ ...mockExecutions[0], executionId: 'uncertain-summary', testId: readyDraft.id, status: 'ERROR', errorCode: 'DISPATCH_UNKNOWN' }];
    const view = render(<StudioScheduleSummary testId={readyDraft.id} />);
    await screen.findByText('Schedule: Blocked · Previous run needs investigation');
    expect(screen.queryByText(/Enabled intent/)).not.toBeInTheDocument();
    expect((await studioSchedulesApi.get(readyDraft.id))?.state).toBe('ENABLED');
    await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: active.version, enabled: false });
    view.rerender(<StudioScheduleSummary testId={readyDraft.id} refreshToken="paused" />);
    await screen.findByText('Schedule: Paused');
    expect((await studioSchedulesApi.get(readyDraft.id))?.unacknowledgedUncertaintyExecutionIds).toEqual(['uncertain-summary']);
  });

  it('schedule dialog labels and structure pass the automated accessibility rules supported by jsdom', async () => {
    renderDialog(); await loaded();
    const result = await axe.run(screen.getByRole('dialog'), { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
  });

  it('standalone uncertainty links stay under /studio rather than the federated route', async () => {
    const uncertain = { ...mockExecutions[0], executionId: 'standalone-run', testId: readyDraft.id, status: 'ERROR' as const, errorCode: 'STALE' as const };
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => readyDraft, getExecutions: () => [uncertain] }));
    await create(); renderDialog(false, '/studio/tests'); await loaded();
    expect(screen.getByRole('link', { name: 'Inspect run standalone-run' })).toHaveAttribute('href', '/studio/runs/standalone-run');
  });

  it('pages actual occurrence links and refusals without inventing browser evidence; removal retains history', async () => {
    const s = await create();
    const rows: ScheduleOccurrence[] = Array.from({ length: 11 }, (_, index) => ({
      id: `occ-${index}`, scheduleId: s.id, scheduleVersion: 2, testId: readyDraft.id, csiId: readyDraft.csiId!,
      environment: readyDraft.environment, executionPrincipal: 'studio-local', activationId: 'activation-1', activatedRevisionId: readyDraft.confirmedRevisionId,
      activatedBy: 'earlier.operator@citi.com', activatedAt: '2026-09-30T12:00:00Z',
      scheduledAt: new Date(Date.UTC(2026, 9, 5, 12, 50 - index * 5)).toISOString(), localScheduledAt: '2026-10-05T12:00:00', timeZone: 'UTC', offsetSeconds: 0,
      decision: index === 0 ? 'ACCEPTED' : 'REFUSED', code: index === 0 ? 'ACCEPTED' : 'LEARN_REQUIRED', executionId: index === 0 ? 'real-run' : null,
      acceptedAt: index === 0 ? '2026-10-05T12:00:00Z' : null, retryAt: null, graceExpiresAt: '2026-10-05T13:00:00Z',
      createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z', missedFrom: null, missedUntil: null, missedCount: null,
    }));
    seedScheduleOccurrences(readyDraft.id, rows);
    renderDialog(); await loaded();
    const table = screen.getByRole('table', { name: 'Schedule occurrences' });
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(within(table).getByRole('link', { name: 'View run' })).toHaveAttribute('href', '/checks/studio/runs/real-run');
    expect(within(table).getAllByText('No browser run accepted')).toHaveLength(9);
    await user().click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).queryByRole('link', { name: 'View run' })).not.toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Remove schedule' }));
    await user().click(screen.getByRole('button', { name: 'Confirm removal' }));
    await screen.findByText('Schedule: No schedule');
    expect((await studioSchedulesApi.occurrences(readyDraft.id)).totalElements).toBe(11);
  });
});
