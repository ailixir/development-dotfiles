import type { Page } from './studioTypes';

/** STUDIO-SCHED-001: operational scheduling is separate from legacy TestDto.schedule. */
export interface SchedulePolicy {
  minIntervalSeconds: number;
  misfireGraceSeconds: number;
  overlap: 'SKIP';
  dstOverlap: 'EARLIER_OFFSET';
}
export interface ScheduleCapabilities {
  enabled: boolean;
  canManage: boolean;
  availableExecutionPrincipals: string[];
  localAuthorizationOnly: boolean;
  policy: SchedulePolicy;
}
export interface SchedulePreviewSlot {
  scheduledAt: string;
  localScheduledAt: string;
  offsetSeconds: number;
}
export interface SchedulePreview {
  normalizedCronExpression: string;
  timeZone: string;
  occurrences: SchedulePreviewSlot[];
  policy: SchedulePolicy;
}
export interface ScheduleOccurrence extends SchedulePreviewSlot {
  id: string;
  scheduleId: string;
  scheduleVersion: number;
  testId: string;
  csiId: string;
  environment: string;
  executionPrincipal: string;
  activationId: string | null;
  activatedRevisionId: string | null;
  activatedBy: string | null;
  activatedAt: string | null;
  timeZone: string;
  decision: 'ACCEPTED' | 'REFUSED' | 'SKIPPED' | 'DEFERRED';
  code: string;
  executionId: string | null;
  acceptedAt: string | null;
  retryAt: string | null;
  graceExpiresAt: string;
  createdAt: string;
  updatedAt: string;
  missedFrom: string | null;
  missedUntil: string | null;
  missedCount: number | null;
}
export interface StudioSchedule {
  id: string;
  testId: string;
  csiId: string;
  version: number;
  cronExpression: string;
  timeZone: string;
  executionPrincipal: string;
  state: 'ENABLED' | 'PAUSED' | 'BLOCKED';
  requestedEnabled: boolean;
  blockedCode: string | null;
  activatedRevisionId: string | null;
  activationId: string | null;
  activatedBy: string | null;
  activatedAt: string | null;
  nextDueAt: string | null;
  pollAfterAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unacknowledgedUncertaintyExecutionIds: string[];
  latestOccurrence: ScheduleOccurrence | null;
}
export interface ScheduleWrite {
  cronExpression: string;
  timeZone: string;
  executionPrincipal: string;
}
export interface ScheduleEnable {
  expectedVersion: number;
  enabled: boolean;
  confirmedRevisionId?: string;
  acknowledgedUncertaintyExecutionIds?: string[];
}
export type ScheduleOccurrencePage = Page<ScheduleOccurrence>;
