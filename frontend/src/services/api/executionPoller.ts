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

    const res = await apiClient.get<{
      data: BackendExecutionResultDto[];
      hasMore?: boolean;
      nextCursor?: string | null;
    }>(`${API_ENDPOINTS.CHECK_HISTORY(checkId)}?limit=5`);

    const match = res.data?.find((e: any) => String(e.id) === executionId);
    if (match) {
      const status = match.status?.toUpperCase();
      if (status === 'SUCCESS' || status === 'FAILURE' || status === 'WARNING' || status === 'TIMEOUT') {
        return mapExecutionResponse(match);
      }
    }

    delay = Math.min(delay * 2, 4_000);
  }

  throw new Error(`Execution ${executionId} did not complete within ${maxWait}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
