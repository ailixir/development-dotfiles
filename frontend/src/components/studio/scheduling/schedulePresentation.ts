import type { ScheduleCapabilities, ScheduleOccurrence, StudioSchedule } from '@/types/studio/studioScheduling';
export const SCHEDULE_CHANGED_EVENT = 'put:studio:schedule-changed';
export function notifyScheduleChanged(testId: string): void {
  window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT, { detail: { testId } }));
}

export function scheduleLabel(schedule: StudioSchedule | null): string {
  if (!schedule) return 'No schedule';
  if (schedule.state === 'PAUSED') return 'Paused';
  if (schedule.requestedEnabled && schedule.unacknowledgedUncertaintyExecutionIds.length) {
    return `Blocked · ${reasonLabel('UNCERTAIN_EXECUTION')}`;
  }
  if (schedule.state === 'ENABLED') return 'Active';
  return `Blocked · ${reasonLabel(schedule.blockedCode)}`;
}
export function reasonLabel(code: string | null): string {
  const labels: Record<string, string> = {
    LEARN_REQUIRED: 'Steps need learning', ACTIVATION_REVISION_MISMATCH: 'Needs explicit Resume',
    UNCERTAIN_EXECUTION: 'Previous run needs investigation', RUNTIME_INCOMPATIBLE: 'Runtime changed',
    BACKGROUND_AUTHORIZATION_DENIED: 'Execution permission withdrawn', BACKGROUND_AUTHORIZATION_UNAVAILABLE: 'Authorization unavailable',
    REFERENCE_UNAVAILABLE: 'Variable or secret unavailable', PENDING_QUOTA_EXCEEDED: 'Capacity unavailable',
    VAULT_UNAVAILABLE: 'Secret service unavailable', OVERLAP: 'Another run is active', MISFIRE: 'Missed scheduled slot',
    GRACE_EXPIRED: 'Grace expired', DISPATCH_DISABLED: 'Execution disabled', SCHEDULE_PAUSED: 'Schedule paused',
    SCHEDULE_UPDATED: 'Schedule updated', SCHEDULE_REMOVED: 'Schedule removed', TEST_DELETED: 'Test deleted', TEST_QUARANTINED: 'Test unavailable',
  };
  return code ? labels[code] ?? 'Review the scheduling outcome' : 'Needs review';
}
export function offsetLabel(seconds: number): string {
  const absolute = Math.abs(seconds);
  return `UTC${seconds < 0 ? '-' : '+'}${String(Math.floor(absolute / 3600)).padStart(2, '0')}:${String(Math.floor(absolute % 3600 / 60)).padStart(2, '0')}`;
}
export function occurrenceLabel(row: ScheduleOccurrence, capabilities: ScheduleCapabilities | null, now = Date.now()): string {
  if (row.decision !== 'DEFERRED') return `${row.decision[0]}${row.decision.slice(1).toLowerCase()} · ${row.code === 'ACCEPTED' ? 'Run accepted' : reasonLabel(row.code)}`;
  if (row.graceExpiresAt && Date.parse(row.graceExpiresAt) <= now) return 'Grace expired; awaiting scheduler settlement';
  if (capabilities?.enabled === false) return 'Scheduling disabled · occurrence suspended';
  return `Deferred · ${reasonLabel(row.code)}`;
}
export function scheduleError(failure: unknown): { message: string; conflict: boolean; field?: 'cron' | 'zone' } {
  const response = (failure as { response?: { status?: number; data?: { code?: string; error?: string } } })?.response;
  const code = response?.data?.code ?? response?.data?.error;
  const messages: Record<string, string> = {
    INVALID_SCHEDULE: 'Enter a supported minute-based cron expression with zero seconds.',
    INVALID_TIME_ZONE: 'Enter a valid IANA time zone, such as UTC or America/New_York.',
    SCHEDULE_EXISTS: 'A schedule already exists. Reload to review it.',
    SCHEDULE_VERSION_CONFLICT: 'This schedule changed since you opened it. Reload to review the latest settings.',
    ACTIVATION_REVISION_MISMATCH: 'The learned steps changed. Reload and review them before resuming.',
    UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED: 'The uncertain runs changed. Reload and investigate them before resuming.',
    LEARN_REQUIRED: 'The saved steps are not learned yet. Once a Run has learned them, reload and explicitly resume the schedule.',
    RUNTIME_INCOMPATIBLE: 'The runtime changed, so the steps must be learned again. Once a Run has relearned them, reload and explicitly resume the schedule.',
    SCHEDULING_DISABLED: 'Scheduling is disabled in this environment. Existing schedule and history remain inspectable.',
    BACKGROUND_AUTHORIZATION_DENIED: 'This execution identity is not authorized for the test and environment.',
    BACKGROUND_AUTHORIZATION_UNAVAILABLE: 'Execution authorization could not be verified. Try again later.',
  };
  return { message: messages[code ?? ''] ?? (response?.status === 403 || response?.status === 404
    ? 'This scheduling resource was not found, or you do not have access to it.' : 'The scheduling request failed. Your input has been kept. Please try again.'),
    conflict: response?.status === 409, field: code === 'INVALID_SCHEDULE' ? 'cron' : code === 'INVALID_TIME_ZONE' ? 'zone' : undefined };
}
