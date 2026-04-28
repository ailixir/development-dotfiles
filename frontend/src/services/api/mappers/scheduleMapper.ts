import type { CheckSchedule } from '../../../types/checks/checkTypes';

export interface BackendScheduleDto {
  id: string;
  checkId: string;
  frequency: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  nextExecutionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapScheduleDtoToCheckSchedule(dto: BackendScheduleDto): CheckSchedule & { id: string; nextExecutionAt: string | null } {
  return {
    id: dto.id,
    frequency: dto.frequency,
    timezone: dto.timezone,
    enabled: dto.enabled,
    cron: dto.cronExpression,
    nextExecutionAt: dto.nextExecutionAt,
  };
}

export function isBackendScheduleDto(raw: any): raw is BackendScheduleDto {
  return raw && typeof raw.cronExpression === 'string' && typeof raw.checkId === 'string';
}

export function mapScheduleResponse(raw: any): BackendScheduleDto {
  return raw;
}
