import type { CheckEntity, CheckSchedule, ExecutionResult } from '../../../types/checks/checkTypes';

export interface BackendCheckDto {
  id: string;
  name: string;
  type: string;
  description: string | null;
  csiId: string;
  csiName: string;
  status: string;
  configuration: Record<string, any>;
  environment: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  schedule?: BackendScheduleDto | null;
  tags?: string[];
}

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

export interface BackendExecutionResultDto {
  id: string;
  checkId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  output: string | null;
  errorMessage: string | null;
}

export function mapCheckDtoToEntity(dto: BackendCheckDto): CheckEntity {
  const schedule: CheckSchedule = dto.schedule
    ? {
        frequency: dto.schedule.frequency ?? '',
        timezone: dto.schedule.timezone ?? 'UTC',
        enabled: dto.schedule.enabled ?? false,
        cron: dto.schedule.cronExpression,
      }
    : { frequency: '', timezone: 'UTC', enabled: false };

  return {
    id: String(dto.id),
    name: dto.name,
    type: dto.type as CheckEntity['type'],
    csiId: dto.csiId,
    csiName: dto.csiName,
    status: dto.status as CheckEntity['status'],
    lastExecution: null,
    nextExecution: dto.schedule?.nextExecutionAt ?? null,
    configuration: dto.configuration as CheckEntity['configuration'],
    schedule,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    createdBy: dto.createdBy,
    tags: dto.tags ?? [],
    description: dto.description ?? undefined,
    environment: dto.environment ?? undefined,
  };
}

export function mapExecutionResultDto(dto: BackendExecutionResultDto): ExecutionResult {
  return {
    id: String(dto.id),
    checkId: String(dto.checkId),
    status: dto.status as ExecutionResult['status'],
    startTime: dto.startedAt,
    endTime: dto.endedAt ?? dto.startedAt,
    duration: dto.durationMs,
    output: dto.output ?? '',
    metadata: {},
    error: dto.errorMessage ?? undefined,
  };
}

export function isBackendCheckDto(raw: any): raw is BackendCheckDto {
  return raw && typeof raw.createdBy === 'string' && typeof raw.csiId === 'string';
}

export function isBackendExecutionResultDto(raw: any): raw is BackendExecutionResultDto {
  return raw && 'startedAt' in raw && 'durationMs' in raw;
}

export function mapCheckResponse(raw: any): CheckEntity {
  if (isBackendCheckDto(raw)) {
    return mapCheckDtoToEntity(raw);
  }
  return raw as CheckEntity;
}

export function mapExecutionResponse(raw: any): ExecutionResult {
  if (isBackendExecutionResultDto(raw)) {
    return mapExecutionResultDto(raw);
  }
  return raw as ExecutionResult;
}
