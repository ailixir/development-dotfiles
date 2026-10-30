import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { MOCK_EXECUTE_DENIED_CSIS, mockTests } from '@/services/mocks/studio/fixtures';
import { schedulesApi } from '@/services/api/schedulesApi';
import ScheduleDialog, { type ScheduleTarget } from './ScheduleDialog';

/**
 * One dialog schedules a check and a UI test: the same endpoints, the same save rule (update the
 * target's schedule when it has one, create it otherwise), only the target id differs.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

const uiTest = mockTests.find((test) => test.csiId !== null && test.readiness === 'READY')!;
const CHECK_ID = '5c0f8b1e-0000-4000-8000-0000000000c1';

const uiTestTarget = (schedule?: ScheduleTarget['schedule']): ScheduleTarget => ({
  kind: 'uiTest',
  id: uiTest.id,
  name: uiTest.name,
  schedule,
});
const checkTarget = (schedule?: ScheduleTarget['schedule']): ScheduleTarget => ({
  kind: 'check',
  id: CHECK_ID,
  name: 'Home page',
  schedule,
});

function open(target: ScheduleTarget | null, onSaved = vi.fn(), onClose = vi.fn()) {
  render(<ScheduleDialog open onClose={onClose} target={target} onSaved={onSaved} />);
  return { onSaved, onClose };
}

describe('ScheduleDialog', () => {
  it('names the target and says "UI test" for a UI test and "Check" for a check', () => {
    const view = render(<ScheduleDialog open onClose={vi.fn()} target={uiTestTarget()} />);
    expect(screen.getByText(uiTest.name)).toBeInTheDocument();
    expect(screen.getByText('UI test is paused')).toBeInTheDocument();
    view.unmount();

    render(<ScheduleDialog open onClose={vi.fn()} target={checkTarget()} />);
    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.getByText('Check is paused')).toBeInTheDocument();
  });

  it('renders nothing without a target', () => {
    const { container } = render(<ScheduleDialog open onClose={vi.fn()} target={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('creates a UI test schedule by uiTestId, tells the caller, and closes', async () => {
    const { onSaved, onClose } = open(uiTestTarget());
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save Schedule' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
    const saved = (await schedulesApi.list({ uiTestId: uiTest.id })).data;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ uiTestId: uiTest.id, checkId: null, enabled: true });
    expect((await schedulesApi.list({ checkId: CHECK_ID })).data).toHaveLength(0);
  });

  it('creates a check schedule by checkId', async () => {
    const { onClose } = open(checkTarget());
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save Schedule' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const saved = (await schedulesApi.list({ checkId: CHECK_ID })).data;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ checkId: CHECK_ID, uiTestId: null, enabled: true });
  });

  it('updates the schedule the target already has instead of creating a second one', async () => {
    const existing = await schedulesApi.create({
      uiTestId: uiTest.id,
      frequency: 'EVERY_5_MINUTES',
      cronExpression: '0 */5 * * * *',
      timezone: 'UTC',
      enabled: true,
    });
    const { onClose } = open(
      uiTestTarget({ frequency: 'EVERY_5_MINUTES', cron: '0 */5 * * * *', timezone: 'UTC', enabled: true }),
    );
    const user = userEvent.setup();
    expect(screen.getByText('UI test will run automatically')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save Schedule' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const saved = (await schedulesApi.list({ uiTestId: uiTest.id })).data;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: existing.id, enabled: false, timezone: 'UTC' });
  });

  it('shows a failure and keeps the dialog open when the server refuses the schedule', async () => {
    MOCK_EXECUTE_DENIED_CSIS.add(uiTest.csiId!);
    const { onSaved, onClose } = open(uiTestTarget());
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save Schedule' }));

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Failed to update schedule. Please try again.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect((await schedulesApi.list({ uiTestId: uiTest.id })).data).toHaveLength(0);
  });
});
