import { apiClient } from './apiClient';
import { API_ENDPOINTS } from '@utils/constants/appConfig';
import type { ExecutionResult } from '../../types/checks/checkTypes';
import { mapExecutionResponse, type BackendExecutionResultDto } from './mappers/checkMapper';

interface PollOptions {
  maxWaitMs?: number;
  initialDelayMs?: number;
}

export async function pollForExecution(
  checkId: string,
  executionId: string,
  opts: PollOptions = {},
): Promise<ExecutionResult> {
  const maxWait = opts.maxWaitMs ?? 30_000;
  let delay = opts.initialDelayMs ?? 500;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await sleep(delay);

    try {
      const res = await apiClient.get<BackendExecutionResultDto>(
        `${API_ENDPOINTS.CHECK_BY_ID(checkId)}/executions/${executionId}`,
      );

      if (res) {
        const status = res.status?.toUpperCase();
        if (status === 'SUCCESS' || status === 'FAILURE' || status === 'WARNING' || status === 'TIMEOUT') {
          return mapExecutionResponse(res);
        }
      }
    } catch {
      // Execution not persisted yet — keep polling
    }

    delay = Math.min(delay * 2, 4_000);
  }

  throw new Error(`Execution ${executionId} did not complete within ${maxWait}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
