export type StudioLogLevel = 'info' | 'warning' | 'error' | 'success';

export interface StudioExecutionLog {
  timestamp: string;
  level: StudioLogLevel;
  message: string;
  stepIndex?: number;
}

export interface StudioStepResult {
  stepIndex: number;
  status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL';
  message?: string;
}

const normalizeLogLevel = (value: unknown): StudioLogLevel => {
  if (value === 'error' || value === 'warning' || value === 'success') return value;
  return 'info';
};

export const normalizeExecutionLogs = (logs: unknown): StudioExecutionLog[] => {
  if (!Array.isArray(logs)) return [];
  return logs
    .filter((log): log is Record<string, unknown> => !!log && typeof log === 'object')
    .map((log) => ({
      timestamp: typeof log.timestamp === 'string' ? log.timestamp : new Date().toISOString(),
      level: normalizeLogLevel(log.level ?? log.type),
      message: typeof log.message === 'string' ? log.message : '',
      stepIndex: typeof log.stepIndex === 'number' ? log.stepIndex : undefined,
    }));
};

export const normalizeStepResults = (results: unknown): StudioStepResult[] => {
  if (!Array.isArray(results)) return [];
  return results
    .filter((result): result is Record<string, unknown> => !!result && typeof result === 'object')
    .filter((result) => typeof result.stepIndex === 'number')
    .map((result) => ({
      stepIndex: result.stepIndex as number,
      status:
        result.status === 'PASS'
          ? 'PASS'
          : result.status === 'FAIL' || result.status === 'FAILED'
            ? 'FAIL'
            : result.status === 'RUNNING'
              ? 'RUNNING'
              : 'PENDING',
      message: typeof result.message === 'string' ? result.message : undefined,
    }));
};
